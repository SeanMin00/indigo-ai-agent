from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from google.adk.agents import LiveRequestQueue
from google.genai import types

log = logging.getLogger("myindigo")


@dataclass
class ClientSession:
    ws: WebSocket
    user_name: str = ""
    user_id: str = ""
    start_time: float = 0.0
    live_queue: LiveRequestQueue = field(default_factory=LiveRequestQueue)
    _chunk_count: int = 0

    async def send_event(self, event: dict[str, Any]) -> None:
        log.info("→ SEND  %s | %s", event.get("type", "?"), json.dumps(event)[:120])
        await self.ws.send_json(event)

    async def send_sound_detected(self, text: str) -> None:
        elapsed = int((time.time() - self.start_time) * 1000) if self.start_time else 0
        await self.send_event({
            "type": "sound_detected",
            "text": text,
            "latency_ms": elapsed,
        })

    async def send_agent_update(
        self, agent: str, status: str, output: str
    ) -> None:
        await self.send_event({
            "type": "agent_update",
            "agent": agent,
            "status": status,
            "output": output,
        })

    async def send_alert(
        self,
        scenario: str,
        title: str,
        subtitle: str,
        risk: str,
    ) -> None:
        await self.send_event({
            "type": "alert",
            "scenario": scenario,
            "title": title,
            "subtitle": subtitle,
            "risk": risk,
        })


async def handle_ws_connection(ws: WebSocket) -> ClientSession:
    """Accept WebSocket, wait for init message, return ClientSession."""
    await ws.accept()
    log.info("⚡ WebSocket accepted, waiting for init...")

    raw = await ws.receive_text()
    msg = json.loads(raw)
    log.info("← RECV  init | %s", json.dumps(msg)[:120])

    if msg.get("type") != "init":
        log.warning("✗ Expected init message, got: %s", msg.get("type"))
        await ws.close(code=4000, reason="Expected init message")
        raise WebSocketDisconnect(code=4000)

    session = ClientSession(
        ws=ws,
        user_name=msg.get("user_name", "User"),
        user_id=msg.get("user_id", ""),
        start_time=time.time(),
    )
    log.info("✓ Session created for user=%s id=%s", session.user_name, session.user_id)
    return session


async def read_audio_loop(session: ClientSession) -> None:
    """Read audio_chunk messages from browser and feed into LiveRequestQueue."""
    log.info("🎙 Audio read loop started")
    try:
        while True:
            raw = await session.ws.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "audio_chunk":
                audio_bytes = base64.b64decode(msg["data"])
                session._chunk_count += 1
                # Feed audio into ADK LiveRequestQueue
                blob = types.Blob(
                    data=audio_bytes,
                    mimeType="audio/pcm;rate=16000",
                )
                session.live_queue.send_realtime(blob)
                if session._chunk_count % 10 == 1:
                    log.debug(
                        "🎙 Audio chunk #%d | %d bytes",
                        session._chunk_count,
                        len(audio_bytes),
                    )
    except WebSocketDisconnect:
        log.info("🎙 Audio loop ended — client disconnected (chunks=%d)", session._chunk_count)
        session.live_queue.close()


async def prompt_loop(session: ClientSession) -> None:
    """Periodically prompt the model to analyze what it hears.

    Gemini Live VAD only responds to speech. For environmental sounds
    (sirens, horns) we send a text nudge every few seconds so the model
    actually processes the audio buffer and tells us what it heard.
    """
    log.info("💬 Prompt loop started")
    prompt = types.Content(
        role="user",
        parts=[types.Part(text=(
            f"Analyze the audio you are receiving right now. "
            f"The user's registered name is {session.user_name}. "
            f"If you hear a siren, horn, or emergency vehicle, say so immediately and delegate. "
            f"If you hear a PA announcement mentioning the name '{session.user_name}', say so and delegate. "
            f"If you hear only silence or background noise, reply with just: AMBIENT"
        ))],
    )
    try:
        while True:
            await asyncio.sleep(3)
            log.debug("💬 Sending analysis prompt")
            session.live_queue.send_content(prompt)
    except asyncio.CancelledError:
        log.info("💬 Prompt loop cancelled")
