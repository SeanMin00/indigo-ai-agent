from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import struct
import time
import wave
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

log = logging.getLogger("myindigo")

SAMPLE_RATE = 16000
CLASSIFY_INTERVAL = 10  # seconds between classification calls (conservative for free tier)


@dataclass
class ClientSession:
    ws: WebSocket
    user_name: str = ""
    user_id: str = ""
    start_time: float = 0.0
    audio_buffer: bytearray = field(default_factory=bytearray)
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

    def take_audio(self) -> bytes:
        """Take accumulated audio and clear the buffer. Returns WAV bytes."""
        if not self.audio_buffer:
            return b""
        pcm = bytes(self.audio_buffer)
        self.audio_buffer.clear()
        # Wrap PCM in WAV header
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm)
        return buf.getvalue()


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
    """Read audio_chunk messages from browser and accumulate PCM bytes."""
    log.info("🎙 Audio read loop started")
    try:
        while True:
            raw = await session.ws.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "audio_chunk":
                audio_bytes = base64.b64decode(msg["data"])
                session._chunk_count += 1
                session.audio_buffer.extend(audio_bytes)
                if session._chunk_count % 20 == 1:
                    log.debug(
                        "🎙 Audio chunk #%d | %d bytes | buffer=%d",
                        session._chunk_count,
                        len(audio_bytes),
                        len(session.audio_buffer),
                    )
    except WebSocketDisconnect:
        log.info("🎙 Audio loop ended — client disconnected (chunks=%d)", session._chunk_count)
