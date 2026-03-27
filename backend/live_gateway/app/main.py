from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.contracts import AudioChunkMessage, InitMessage
from app.pipeline_bridge import call_next_pipeline, map_pipeline_result_to_messages
from app.session import LiveGatewaySession
from app.transcript_provider import build_transcript_provider

app = FastAPI(title="myIndigo Live Gateway")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "live-gateway",
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    transcript_provider = build_transcript_provider()
    session: LiveGatewaySession | None = None

    try:
        while True:
            payload = await websocket.receive_json()
            message_type = payload.get("type")

            if message_type == "init":
                init = InitMessage.model_validate(payload)
                session = LiveGatewaySession(
                    user_name=init.user_name,
                    user_id=init.user_id,
                    scenario=init.scenario or "siren",
                )
                continue

            if message_type != "audio_chunk" or session is None:
                continue

            chunk = AudioChunkMessage.model_validate(payload)
            transcript_event = await transcript_provider.ingest_chunk(session, chunk.data)

            if transcript_event is None:
                continue

            result = await call_next_pipeline(
                transcript=transcript_event.transcript,
                confidence=transcript_event.confidence,
                scenario=transcript_event.scenario,
            )

            for index, message in enumerate(
                map_pipeline_result_to_messages(result, transcript_event.scenario)
            ):
                if index:
                    await asyncio.sleep(0.45)
                await websocket.send_json(message)
    except WebSocketDisconnect:
        return
