from __future__ import annotations

import logging
import time
from typing import Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.config import settings
from app.contracts import AudioChunkMessage, InitMessage
from app.orchestrator import dispatch_and_run
from app.runtime import build_runtime
from app.session import AudioSession

# ── Logging setup ──
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)-7s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
# Quiet noisy libraries
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("google").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

log = logging.getLogger("myindigo.main")

app = FastAPI(title="myIndigo ADK Live Service")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "adk-live-service"}


@app.get("/debug/config")
async def debug_config() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "adk-live-service",
        "classify_model": settings.classify_model,
        "adk_agent_model": settings.adk_agent_model,
        "adk_app_name": settings.adk_app_name,
        "adk_key_source": settings.adk_gemini_api_key_source,
        "adk_key_present": bool(settings.adk_gemini_api_key),
        "confidence_threshold": settings.confidence_threshold,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    runtime = build_runtime()
    session: Optional[AudioSession] = None

    async def send_event(event: dict[str, Any]) -> None:
        """Send a WebSocket event to the browser and log it."""
        log.info(
            "[WS OUT] type=%s | %s",
            event.get("type"),
            {k: v for k, v in event.items() if k != "type"},
        )
        await websocket.send_json(event)

    try:
        while True:
            payload = await websocket.receive_json()
            message_type = payload.get("type")

            if message_type == "init":
                init = InitMessage.model_validate(payload)
                session = AudioSession(
                    user_name=init.user_name,
                    user_id=init.user_id,
                )
                log.info(
                    "[WS] Session initialized | user=%s | name=%s",
                    init.user_id,
                    init.user_name,
                )
                continue

            if message_type != "audio_chunk" or session is None:
                continue

            chunk = AudioChunkMessage.model_validate(payload)
            frame = await runtime.ingest_audio(session, chunk)

            if frame is None:
                continue

            # We got a classification from Gemini Live — run the pipeline
            await dispatch_and_run(
                frame=frame,
                user_name=session.user_name,
                send_event=send_event,
            )

    except WebSocketDisconnect:
        log.info("[WS] Client disconnected | user=%s", session.user_id if session else "unknown")
    except Exception as exc:
        log.exception("[WS] Unexpected error: %s", exc)
    finally:
        if session is not None:
            await runtime.close_session(session)
        await runtime.shutdown()
