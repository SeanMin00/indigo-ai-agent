from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import struct
import sys
import time
from typing import Any

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai
from google.genai import types as genai_types

from agents.vehicle_sound_agent import vehicle_sound_agent
from agents.name_detection_agent import name_detection_agent
from ws_handler import handle_ws_connection, read_audio_loop, ClientSession, CLASSIFY_INTERVAL
from demo import run_demo, SCENARIOS

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

load_dotenv()

# ── Logging setup ────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("myindigo")

logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("google").setLevel(logging.WARNING)

# ── Gemini client for audio classification ───────────────
api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
gemini_client = genai.Client(api_key=api_key)
CLASSIFY_MODEL = "gemini-2.0-flash"

log.info("=" * 60)
log.info("  myIndigo AI Service starting")
log.info("  Classification model: %s", CLASSIFY_MODEL)
log.info("  Classify interval: %ds", CLASSIFY_INTERVAL)
log.info("=" * 60)

# ── FastAPI app ──────────────────────────────────────────
app = FastAPI(title="myIndigo AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ADK runners for sub-agents (text-based, non-live)
session_service = InMemorySessionService()

vehicle_runner = Runner(
    agent=vehicle_sound_agent,
    app_name="myindigo_vehicle",
    session_service=session_service,
)
name_runner = Runner(
    agent=name_detection_agent,
    app_name="myindigo_name",
    session_service=session_service,
)

# Track active WebSocket sessions for demo triggering
active_sessions: dict[str, ClientSession] = {}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "myindigo-ai-service"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    client = await handle_ws_connection(ws)
    active_sessions[client.user_id] = client
    log.info("Active sessions: %d", len(active_sessions))

    audio_task = asyncio.create_task(read_audio_loop(client))
    classify_task = asyncio.create_task(classify_loop(client))

    await client.send_agent_update(
        "dispatch", "active", "DispatchAgent listening — Gemini audio classification"
    )

    try:
        # Keep alive until audio_task ends (client disconnect)
        await audio_task
    except Exception as e:
        log.error("❌ WS error: %s", e)
    finally:
        classify_task.cancel()
        active_sessions.pop(client.user_id, None)
        log.info("🔌 Client disconnected. Active sessions: %d", len(active_sessions))


# ── Audio classification loop ────────────────────────────

DEBOUNCE_SECS = 10
RMS_THRESHOLD = 500  # ignore quiet audio (silence/background noise) without calling API
_last_dispatch: dict[str, float] = {}
_backoff_until: float = 0.0
_classify_in_flight: bool = False


def _pcm_rms(wav_bytes: bytes) -> float:
    """Compute RMS energy of PCM16 audio to gate silent frames locally."""
    # WAV header is 44 bytes; PCM data follows
    pcm = wav_bytes[44:]
    if len(pcm) < 2:
        return 0.0
    n_samples = len(pcm) // 2
    samples = struct.unpack(f"<{n_samples}h", pcm[: n_samples * 2])
    sq_sum = sum(s * s for s in samples)
    return math.sqrt(sq_sum / n_samples)


async def classify_loop(client: ClientSession) -> None:
    """Every N seconds, take the audio buffer and classify it with Gemini.

    Saves API calls by:
    1. Local RMS gate — silent audio never hits the API
    2. Single combined classify+transcribe call instead of two separate ones
    3. 10s interval + 60s backoff on rate limit
    """
    global _backoff_until, _classify_in_flight
    log.info("🔊 Classify loop started (interval=%ds)", CLASSIFY_INTERVAL)
    try:
        await asyncio.sleep(CLASSIFY_INTERVAL)
        while True:
            now = time.time()
            if now < _backoff_until:
                wait = _backoff_until - now
                log.debug("  (rate-limit backoff, %.1fs remaining)", wait)
                await asyncio.sleep(min(wait, CLASSIFY_INTERVAL))
                continue
            if _classify_in_flight:
                log.debug("  (classify already in-flight, skipping)")
                await asyncio.sleep(CLASSIFY_INTERVAL)
                continue

            wav_bytes = client.take_audio()
            if wav_bytes and len(wav_bytes) > 100:
                rms = _pcm_rms(wav_bytes)
                if rms < RMS_THRESHOLD:
                    log.debug("  quiet audio (RMS=%.0f) — skipping API call", rms)
                    await asyncio.sleep(CLASSIFY_INTERVAL)
                    continue

                log.info("🔊 Audio RMS=%.0f (above threshold) — calling Gemini", rms)
                _classify_in_flight = True
                try:
                    await classify_audio(client, wav_bytes)
                finally:
                    _classify_in_flight = False
            await asyncio.sleep(CLASSIFY_INTERVAL)
    except asyncio.CancelledError:
        log.info("🔊 Classify loop cancelled")


async def classify_audio(client: ClientSession, wav_bytes: bytes) -> None:
    """Single Gemini call that classifies AND transcribes (saves one API call)."""
    try:
        log.info("🔊 Classifying %d bytes of audio...", len(wav_bytes))

        response = await gemini_client.aio.models.generate_content(
            model=CLASSIFY_MODEL,
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part(
                            inline_data=genai_types.Blob(
                                data=wav_bytes,
                                mimeType="audio/wav",
                            )
                        ),
                        genai_types.Part(
                            text=(
                                f'IMPORTANT: The user is deaf/hard-of-hearing. '
                                f'Their name is "{client.user_name}" '
                                f'(first name: "{client.user_name.split()[0]}"). '
                                f'Missing a name call is DANGEROUS — if in doubt, choose NAME_CALLED.\n\n'
                                "Listen to this audio carefully. First transcribe what you hear, "
                                "then classify.\n\n"
                                "Respond with ONLY a JSON object (no markdown, no explanation):\n"
                                '{"category": "SIREN"|"NAME_CALLED"|"SPEECH"|"AMBIENT", "transcript": "..."}\n\n'
                                "Categories (check in this order):\n"
                                "1. SIREN — siren, horn, alarm, or emergency vehicle sound\n"
                                f'2. NAME_CALLED — speech that contains "{client.user_name}", '
                                f'"{client.user_name.split()[0]}", or anything that sounds similar '
                                f'(e.g. "Alex", "Alec", "Kim", "A. Kim"). '
                                f"Be GENEROUS — partial matches, nicknames, and slight "
                                f"mispronunciations all count.\n"
                                "3. SPEECH — human speech where the user's name is definitely NOT said\n"
                                "4. AMBIENT — silence, background noise, nothing notable\n\n"
                                "Always include the transcript of what you hear."
                            )
                        ),
                    ],
                )
            ],
        )

        raw = response.text.strip() if response.text else '{"category":"AMBIENT","transcript":""}'
        # Strip markdown fences if present
        clean = re.sub(r"^```(?:json)?\s*", "", raw)
        clean = re.sub(r"\s*```$", "", clean)
        log.info("🔊 Classification raw: %s", clean[:200])

        try:
            data = json.loads(clean)
        except json.JSONDecodeError:
            # Fallback: try to extract category from plain text
            upper = clean.upper()
            if "SIREN" in upper:
                data = {"category": "SIREN", "transcript": ""}
            elif "NAME" in upper:
                data = {"category": "NAME_CALLED", "transcript": ""}
            elif "SPEECH" in upper:
                data = {"category": "SPEECH", "transcript": ""}
            else:
                data = {"category": "AMBIENT", "transcript": ""}

        category = data.get("category", "AMBIENT").upper()
        transcript = data.get("transcript", "")
        now = time.time()

        if "SIREN" in category:
            if now - _last_dispatch.get("siren", 0) < DEBOUNCE_SECS:
                log.debug("  (siren debounced)")
                return
            _last_dispatch["siren"] = now

            log.info("🚨 SIREN detected — calling VehicleSoundAgent")
            await client.send_sound_detected("Siren/emergency sound detected")
            await client.send_agent_update(
                "dispatch", "done", "Emergency sound classified — delegating to VehicleSoundAgent"
            )
            await call_vehicle_agent(client)

        elif "NAME" in category:
            if now - _last_dispatch.get("name", 0) < DEBOUNCE_SECS:
                log.debug("  (name debounced)")
                return
            _last_dispatch["name"] = now

            log.info("📢 NAME detected in speech")
            await client.send_sound_detected(
                f'Your name was heard: "{client.user_name}" — "{transcript}"'
            )
            await client.send_agent_update(
                "dispatch", "done",
                f'Name "{client.user_name}" detected in speech — delegating to NameDetectionAgent'
            )
            await call_name_agent(client, transcript)

        elif "SPEECH" in category:
            # Use name debounce — speech goes to name agent as a safety net
            if now - _last_dispatch.get("name", 0) < DEBOUNCE_SECS:
                log.debug("  (speech→name debounced)")
                return
            _last_dispatch["name"] = now

            log.info("📢 SPEECH detected — double-checking for name mention")
            await client.send_sound_detected(f"Speech detected: {transcript}")
            await client.send_agent_update(
                "dispatch", "done", "Speech classified — checking for name mention"
            )
            await call_name_agent(client, transcript)

        else:
            log.debug("  ambient — no action")
            await client.send_agent_update(
                "dispatch", "active", "DispatchAgent listening — Gemini audio classification"
            )

    except Exception as e:
        global _backoff_until
        err_str = str(e)
        log.error("❌ Classification error: %s: %s", type(e).__name__, err_str[:300])
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            _backoff_until = time.time() + 60  # back off 60s on free tier
            log.warning("⏳ Rate-limited — backing off 60s")
            await client.send_agent_update(
                "dispatch", "active",
                "⚠️ Gemini API rate-limited (free tier quota exhausted). Retrying in 60s..."
            )


# ── Sub-agent calls ──────────────────────────────────────

async def call_vehicle_agent(client: ClientSession) -> None:
    """Call VehicleSoundAgent via ADK."""
    log.info("🚒 Calling VehicleSoundAgent")
    await client.send_agent_update("vehicle", "active", "VehicleSoundAgent analyzing...")

    try:
        sub_session = await session_service.create_session(
            app_name="myindigo_vehicle",
            user_id=client.user_id,
        )
        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=(
                "An emergency vehicle siren/horn was detected near the user. "
                "The user is a pedestrian. Classify the sound and assess risk."
            ))],
        )
        text = ""
        async for event in vehicle_runner.run_async(
            session_id=sub_session.id,
            user_id=client.user_id,
            new_message=content,
        ):
            ec = getattr(event, "content", None)
            if ec and hasattr(ec, "parts"):
                for p in ec.parts:
                    if hasattr(p, "text") and p.text:
                        text += p.text

        log.info("🚒 VehicleSoundAgent: %s", text[:150])
        try:
            data = json.loads(text.strip())
            await client.send_agent_update(
                "vehicle", "done",
                f"Risk: {data.get('risk', 'HIGH')} — {data.get('vehicle_type', 'emergency')}"
            )
            await client.send_alert(
                scenario="siren",
                title=data.get("title", "Emergency vehicle detected"),
                subtitle=data.get("subtitle", "Check your surroundings"),
                risk=data.get("risk", "HIGH"),
            )
        except json.JSONDecodeError:
            await client.send_agent_update("vehicle", "done", text.strip()[:100] or "Analyzed")
            await client.send_alert(
                scenario="siren",
                title="Emergency sound detected",
                subtitle="Check your surroundings",
                risk="HIGH",
            )
    except Exception as e:
        log.error("❌ VehicleSoundAgent error: %s", e)
        await client.send_agent_update("vehicle", "done", f"Error: {e}")


async def call_name_agent(client: ClientSession, transcript: str) -> None:
    """Call NameDetectionAgent via ADK to check if user's name was mentioned."""
    log.info("📢 Calling NameDetectionAgent: %s", transcript[:80])
    await client.send_agent_update("name", "active", "NameDetectionAgent analyzing speech...")

    try:
        sub_session = await session_service.create_session(
            app_name="myindigo_name",
            user_id=client.user_id,
        )
        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=(
                f'Transcript of speech/announcement: "{transcript}"\n'
                f"User's registered name: \"{client.user_name}\"\n"
                f"Check if this person's name was mentioned. Respond with JSON only."
            ))],
        )
        text = ""
        async for event in name_runner.run_async(
            session_id=sub_session.id,
            user_id=client.user_id,
            new_message=content,
        ):
            ec = getattr(event, "content", None)
            if ec and hasattr(ec, "parts"):
                for p in ec.parts:
                    if hasattr(p, "text") and p.text:
                        text += p.text

        # Strip markdown code fences if the model wraps the JSON
        clean = re.sub(r"^```(?:json)?\s*", "", text.strip())
        clean = re.sub(r"\s*```$", "", clean)

        log.info("📢 NameDetectionAgent raw: %s", text[:200])
        try:
            data = json.loads(clean)
            if data.get("name_found"):
                location = data.get("location_detail", "")
                subtitle = data.get("subtitle", "Someone called your name")
                detail = f"Name confirmed: \"{client.user_name}\""
                if location:
                    detail += f" — {location}"

                await client.send_agent_update("name", "done", detail)
                await client.send_alert(
                    scenario="name",
                    title=data.get("title", "Your name is being called!"),
                    subtitle=subtitle,
                    risk="MEDIUM",
                )
                log.info("📢 ✓ Name found! title=%s subtitle=%s location=%s",
                         data.get("title"), subtitle, location)
            else:
                await client.send_agent_update("name", "done", "Not for you — resuming")
                # Reset dispatch back to listening
                await client.send_agent_update(
                    "dispatch", "active", "DispatchAgent listening — Gemini audio classification"
                )
                log.info("📢 ✗ Name not found in transcript")
        except json.JSONDecodeError:
            log.warning("📢 Could not parse NameDetectionAgent JSON: %s", clean[:150])
            await client.send_agent_update("name", "done", text.strip()[:100] or "Checked")
            await client.send_agent_update(
                "dispatch", "active", "DispatchAgent listening — Gemini audio classification"
            )
    except Exception as e:
        err_str = str(e)
        log.error("❌ NameDetectionAgent error: %s: %s", type(e).__name__, err_str[:300])
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            log.warning("⏳ NameDetectionAgent rate-limited")
            await client.send_agent_update("name", "done", "⚠️ Rate-limited — Gemini quota exhausted")
        else:
            await client.send_agent_update("name", "done", f"Error: {err_str[:100]}")
        await client.send_agent_update(
            "dispatch", "active", "DispatchAgent listening — Gemini audio classification"
        )


# ── Test endpoint for name detection (bypasses audio) ─────

@app.get("/test/name")
async def test_name_endpoint(
    transcript: str = "Alex Kim, please report to Gate B12",
    user_name: str = "Alex Kim",
) -> dict[str, Any]:
    """Test NameDetectionAgent directly with text. No audio needed.
    Usage: GET /test/name?transcript=Alex+please+come+here&user_name=Alex+Kim
    """
    import traceback as tb

    log.info("🧪 TEST /test/name — transcript=%r, user_name=%r", transcript, user_name)

    result: dict[str, Any] = {
        "input": {"transcript": transcript, "user_name": user_name},
    }

    try:
        sub_session = await session_service.create_session(
            app_name="myindigo_name",
            user_id="test-user",
        )
        prompt = (
            f'Transcript of speech/announcement: "{transcript}"\n'
            f'User\'s registered name: "{user_name}"\n'
            f"Check if this person's name was mentioned. Respond with JSON only."
        )
        log.info("🧪 Prompt: %s", prompt)

        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=prompt)],
        )

        text = ""
        events_debug: list[str] = []
        async for event in name_runner.run_async(
            session_id=sub_session.id,
            user_id="test-user",
            new_message=content,
        ):
            ec = getattr(event, "content", None)
            event_info = f"author={getattr(event, 'author', '?')} type={type(event).__name__}"
            if ec and hasattr(ec, "parts"):
                for p in ec.parts:
                    if hasattr(p, "text") and p.text:
                        text += p.text
                        event_info += f" text={p.text[:100]}"
            events_debug.append(event_info)
            log.info("🧪 Event: %s", event_info)

        clean = re.sub(r"^```(?:json)?\s*", "", text.strip())
        clean = re.sub(r"\s*```$", "", clean)

        result["raw_output"] = text
        result["cleaned"] = clean
        result["events"] = events_debug

        try:
            data = json.loads(clean)
            result["parsed"] = data
            result["name_found"] = data.get("name_found", False)
        except json.JSONDecodeError as e:
            result["json_error"] = str(e)
            result["name_found"] = None

    except Exception as e:
        result["error"] = f"{type(e).__name__}: {str(e)[:500]}"
        result["traceback"] = tb.format_exc()
        log.error("🧪 TEST error: %s", result["error"])

    log.info("🧪 TEST result: %s", json.dumps(result, indent=2)[:500])
    return result


@app.get("/test/classify")
async def test_classify_endpoint(
    text: str = "Alex Kim please come to gate B12",
    user_name: str = "Alex Kim",
) -> dict[str, Any]:
    """Test classification prompt with text (simulates what audio would contain).
    Usage: GET /test/classify?text=Alex+come+here&user_name=Alex+Kim
    """
    log.info("🧪 TEST /test/classify — text=%r, user_name=%r", text, user_name)

    prompt = (
        f'IMPORTANT: The user is deaf/hard-of-hearing. '
        f'Their name is "{user_name}" '
        f'(first name: "{user_name.split()[0]}"). '
        f'Missing a name call is DANGEROUS — if in doubt, choose NAME_CALLED.\n\n'
        f'The following text represents what was heard: "{text}"\n'
        "Classify it.\n\n"
        "Respond with ONLY a JSON object (no markdown, no explanation):\n"
        '{"category": "SIREN"|"NAME_CALLED"|"SPEECH"|"AMBIENT", "transcript": "..."}\n\n'
        "Categories (check in this order):\n"
        "1. SIREN — siren, horn, alarm, or emergency vehicle sound\n"
        f'2. NAME_CALLED — speech that contains "{user_name}", '
        f'"{user_name.split()[0]}", or anything that sounds similar. '
        f"Be GENEROUS — partial matches, nicknames, and slight "
        f"mispronunciations all count.\n"
        "3. SPEECH — human speech where the user's name is definitely NOT said\n"
        "4. AMBIENT — silence, background noise, nothing notable\n"
    )

    result: dict[str, Any] = {
        "input": {"text": text, "user_name": user_name},
        "prompt": prompt,
    }

    try:
        response = await gemini_client.aio.models.generate_content(
            model=CLASSIFY_MODEL,
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=prompt)],
                )
            ],
        )
        raw = response.text.strip() if response.text else ""
        clean = re.sub(r"^```(?:json)?\s*", "", raw)
        clean = re.sub(r"\s*```$", "", clean)
        result["raw"] = raw
        result["cleaned"] = clean

        try:
            data = json.loads(clean)
            result["parsed"] = data
            result["category"] = data.get("category", "UNKNOWN")
        except json.JSONDecodeError as e:
            result["json_error"] = str(e)
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {str(e)[:500]}"

    log.info("🧪 TEST classify result: %s", json.dumps(result, indent=2)[:500])
    return result


# ── Demo trigger ─────────────────────────────────────────

@app.post("/demo/{scenario}")
async def trigger_demo(scenario: str) -> dict[str, str]:
    log.info("🎬 Demo triggered: scenario=%s, clients=%d", scenario, len(active_sessions))
    if scenario not in SCENARIOS:
        return {"error": f"Unknown scenario: {scenario}. Use: {list(SCENARIOS.keys())}"}
    tasks = [run_demo(session, scenario) for session in active_sessions.values()]
    if tasks:
        await asyncio.gather(*tasks)
        return {"ok": "true", "scenario": scenario}
    return {"error": "No connected clients"}
