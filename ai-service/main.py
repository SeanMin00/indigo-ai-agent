from __future__ import annotations

import asyncio
import json
import logging
import sys

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from agents import root_agent
from ws_handler import handle_ws_connection, read_audio_loop, prompt_loop, ClientSession
from demo import run_demo, SCENARIOS

load_dotenv()

# ── Logging setup ────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("myindigo")

# Quiet noisy libraries
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("google").setLevel(logging.INFO)

log.info("=" * 60)
log.info("  myIndigo AI Service starting")
log.info("  Agent: %s → sub_agents: %s", root_agent.name, [a.name for a in root_agent.sub_agents])
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

session_service = InMemorySessionService()

runner = Runner(
    agent=root_agent,
    app_name="myindigo",
    session_service=session_service,
)

# Track active WebSocket sessions for demo triggering
active_sessions: dict[str, ClientSession] = {}


@app.get("/health")
async def health() -> dict[str, str]:
    log.debug("/health called")
    return {"status": "ok", "service": "myindigo-ai-service"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    client = await handle_ws_connection(ws)
    active_sessions[client.user_id] = client
    log.info("Active sessions: %d", len(active_sessions))

    try:
        # Create ADK session with user context
        log.info("Creating ADK session for user=%s...", client.user_name)
        adk_session = await session_service.create_session(
            app_name="myindigo",
            user_id=client.user_id,
            state={"user_name": client.user_name},
        )
        log.info("✓ ADK session created: %s", adk_session.id)

        # Notify frontend: dispatch is listening
        await client.send_agent_update(
            "dispatch", "active", "DispatchAgent listening — Gemini Live connected"
        )

        # Start reading browser audio in background
        audio_task = asyncio.create_task(read_audio_loop(client))
        log.info("🎙 Audio read loop launched")

        # Periodically prompt model to analyze audio (VAD won't trigger on non-speech)
        prompt_task = asyncio.create_task(prompt_loop(client))
        log.info("💬 Prompt loop launched")

        try:
            # Run ADK live session with audio streaming
            log.info("🚀 Starting runner.run_live()...")
            live_events = runner.run_live(
                session=adk_session,
                live_request_queue=client.live_queue,
            )

            event_count = 0
            async for event in live_events:
                event_count += 1
                log.info(
                    "📨 ADK event #%d | author=%s | type=%s",
                    event_count,
                    getattr(event, "author", "?"),
                    type(event).__name__,
                )
                await process_adk_event(client, event)

            log.info("ADK live stream ended after %d events", event_count)

        except Exception as e:
            log.error("❌ ADK session error: %s: %s", type(e).__name__, e, exc_info=True)
            # Fall back gracefully — WebSocket stays open for demo mode
            await client.send_agent_update(
                "dispatch", "active",
                f"DispatchAgent listening — demo mode (ADK: {type(e).__name__})"
            )
            log.info("↩ Falling back to demo mode, keeping connection alive")
            # Keep connection alive for demo triggers
            try:
                while True:
                    await asyncio.sleep(1)
            except asyncio.CancelledError:
                pass
        finally:
            audio_task.cancel()
            prompt_task.cancel()
            client.live_queue.close()

    except Exception as e:
        log.error("❌ WebSocket error: %s: %s", type(e).__name__, e, exc_info=True)
    finally:
        active_sessions.pop(client.user_id, None)
        log.info("🔌 Client disconnected. Active sessions: %d", len(active_sessions))


async def process_adk_event(client: ClientSession, event: object) -> None:
    """Parse ADK event and broadcast appropriate WebSocket messages."""
    author = getattr(event, "author", "")
    content = getattr(event, "content", None)

    if not content or not hasattr(content, "parts"):
        log.debug("  (skipped event — no content.parts)")
        return

    text = ""
    for part in content.parts:
        # Text from regular responses or sub-agent delegation
        if hasattr(part, "text") and part.text:
            text += part.text
        # Text from audio transcription (native-audio model sends these)
        if hasattr(part, "transcript") and part.transcript:
            text += part.transcript

    if not text.strip():
        log.debug("  (skipped event — empty text)")
        return

    clean = text.strip()
    log.info("🤖 [%s] %s", author, clean[:150])

    # Skip ambient/silence responses
    if clean.upper() == "AMBIENT" or clean.upper().startswith("AMBIENT"):
        log.debug("  (ambient — no alert)")
        return

    # Route based on which agent produced the event
    if author == "dispatch_agent":
        if any(kw in text.lower() for kw in ["siren", "horn", "crash", "emergency", "vehicle"]):
            log.info("  → Dispatch classified: EMERGENCY SOUND")
            await client.send_sound_detected(text.strip())
            await client.send_agent_update("dispatch", "done", text.strip())
        elif any(kw in text.lower() for kw in ["announcement", "name", "paging", "called"]):
            log.info("  → Dispatch classified: NAME/ANNOUNCEMENT")
            await client.send_sound_detected(text.strip())
            await client.send_agent_update("dispatch", "done", text.strip())
        else:
            log.info("  → Dispatch: generic output")
            await client.send_agent_update("dispatch", "active", text.strip())

    elif author == "vehicle_sound_agent":
        log.info("  → VehicleSoundAgent responding")
        await client.send_agent_update("vehicle", "active", "VehicleSoundAgent analyzing...")
        try:
            data = json.loads(text.strip())
            log.info("  → Vehicle JSON: risk=%s title=%s", data.get("risk"), data.get("title"))
            await client.send_agent_update(
                "vehicle", "done", f"Risk: {data.get('risk', 'UNKNOWN')}"
            )
            await client.send_alert(
                scenario="siren",
                title=data.get("title", "Emergency vehicle detected"),
                subtitle=data.get("subtitle", "Check your surroundings"),
                risk=data.get("risk", "HIGH"),
            )
        except json.JSONDecodeError:
            log.warning("  → Vehicle output not JSON: %s", text.strip()[:80])
            await client.send_agent_update("vehicle", "done", text.strip())

    elif author == "name_detection_agent":
        log.info("  → NameDetectionAgent responding")
        await client.send_agent_update("name", "active", "NameDetectionAgent checking...")
        try:
            data = json.loads(text.strip())
            log.info("  → Name JSON: found=%s detail=%s", data.get("name_found"), data.get("location_detail"))
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
            log.warning("  → Name output not JSON: %s", text.strip()[:80])
            await client.send_agent_update("name", "done", text.strip())

    else:
        log.info("  → Unknown agent author: %s", author)


@app.post("/demo/{scenario}")
async def trigger_demo(scenario: str) -> dict[str, str]:
    """Trigger a simulated demo sequence for all connected clients."""
    log.info("🎬 Demo triggered: scenario=%s, clients=%d", scenario, len(active_sessions))

    if scenario not in SCENARIOS:
        return {"error": f"Unknown scenario: {scenario}. Use: {list(SCENARIOS.keys())}"}

    tasks = [run_demo(session, scenario) for session in active_sessions.values()]
    if tasks:
        await asyncio.gather(*tasks)
        log.info("✓ Demo complete: %s", scenario)
        return {"ok": "true", "scenario": scenario}

    log.warning("✗ No connected clients for demo")
    return {"error": "No connected clients"}
