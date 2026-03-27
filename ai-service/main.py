from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import time

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
CLASSIFY_MODEL = "gemini-2.5-flash"

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

DEBOUNCE_SECS = 8
_last_dispatch: dict[str, float] = {}


async def classify_loop(client: ClientSession) -> None:
    """Every N seconds, take the audio buffer and classify it with Gemini."""
    log.info("🔊 Classify loop started (interval=%ds)", CLASSIFY_INTERVAL)
    try:
        await asyncio.sleep(CLASSIFY_INTERVAL)
        while True:
            wav_bytes = client.take_audio()
            if wav_bytes and len(wav_bytes) > 100:
                asyncio.create_task(classify_audio(client, wav_bytes))
            await asyncio.sleep(CLASSIFY_INTERVAL)
    except asyncio.CancelledError:
        log.info("🔊 Classify loop cancelled")


async def classify_audio(client: ClientSession, wav_bytes: bytes) -> None:
    """Send audio to Gemini and classify as SIREN, SPEECH, or AMBIENT."""
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
                                "Classify this audio into exactly ONE category. "
                                "Reply with ONLY the category name, nothing else:\n"
                                "SIREN - if you hear a siren, horn, alarm, or emergency vehicle\n"
                                "SPEECH - if you hear human speech or a PA announcement\n"
                                "AMBIENT - if you hear silence, background noise, or nothing notable"
                            )
                        ),
                    ],
                )
            ],
        )

        result = response.text.strip().upper() if response.text else "AMBIENT"
        log.info("🔊 Classification result: %s", result)

        now = time.time()

        if "SIREN" in result:
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

        elif "SPEECH" in result:
            if now - _last_dispatch.get("speech", 0) < DEBOUNCE_SECS:
                log.debug("  (speech debounced)")
                return
            _last_dispatch["speech"] = now

            log.info("📢 SPEECH detected — calling NameDetectionAgent")
            # Get transcript of the speech
            transcript = await transcribe_audio(wav_bytes)
            await client.send_sound_detected(f"Speech detected: {transcript}")
            await client.send_agent_update(
                "dispatch", "done", "Speech classified — delegating to NameDetectionAgent"
            )
            await call_name_agent(client, transcript)

        else:
            log.debug("  ambient — no action")
            # Reset dispatch agent to listening state
            await client.send_agent_update(
                "dispatch", "active", "DispatchAgent listening — Gemini audio classification"
            )

    except Exception as e:
        log.error("❌ Classification error: %s: %s", type(e).__name__, e)


async def transcribe_audio(wav_bytes: bytes) -> str:
    """Transcribe audio using Gemini."""
    try:
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
                        genai_types.Part(text="Transcribe this audio. Return only the transcript text."),
                    ],
                )
            ],
        )
        return response.text.strip() if response.text else "(inaudible)"
    except Exception as e:
        log.error("❌ Transcription error: %s", e)
        return "(transcription failed)"


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
    """Call NameDetectionAgent via ADK."""
    log.info("📢 Calling NameDetectionAgent: %s", transcript[:80])
    await client.send_agent_update("name", "active", "NameDetectionAgent checking...")

    try:
        sub_session = await session_service.create_session(
            app_name="myindigo_name",
            user_id=client.user_id,
        )
        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=(
                f'Transcript of PA announcement: "{transcript}"\n'
                f"User's registered name: {client.user_name}\n"
                f"Was the user's name mentioned? Respond with JSON only."
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

        log.info("📢 NameDetectionAgent: %s", text[:150])
        try:
            data = json.loads(text.strip())
            if data.get("name_found"):
                await client.send_agent_update(
                    "name", "done",
                    f"Name confirmed — {data.get('location_detail', '')}"
                )
                await client.send_alert(
                    scenario="name",
                    title=data.get("title", "Your name was called"),
                    subtitle=data.get("subtitle", ""),
                    risk="MEDIUM",
                )
            else:
                await client.send_agent_update("name", "done", "Not for you — resuming")
        except json.JSONDecodeError:
            await client.send_agent_update("name", "done", text.strip()[:100] or "Checked")
    except Exception as e:
        log.error("❌ NameDetectionAgent error: %s", e)
        await client.send_agent_update("name", "done", f"Error: {e}")


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
