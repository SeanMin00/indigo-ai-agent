from __future__ import annotations

import asyncio
import io
import logging
import struct
import time
import wave
from dataclasses import dataclass
from typing import Optional

from google import genai
from google.genai import types

from app.audio_codec import build_audio_decoder
from app.config import settings
from app.contracts import AudioCategory, AudioChunkMessage
from app.prompts import CLASSIFY_PROMPT
from app.session import AudioSession

log = logging.getLogger("myindigo.runtime")

# Classify every N seconds of accumulated audio
CLASSIFY_INTERVAL = 3.0
SAMPLE_RATE = 16000


@dataclass
class ClassifiedFrame:
    """Output from Gemini: a classified audio event."""

    category: AudioCategory
    transcript: str
    confidence: float
    raw_text: str


class GeminiClassifyRuntime:
    """
    Accumulates PCM16 audio from the browser, then every few seconds
    sends the audio blob to Gemini generate_content() for classification.

    This is more reliable than Gemini Live for non-speech sounds (sirens)
    because we control exactly when to classify and craft a specific prompt.
    """

    def __init__(self) -> None:
        self.api_key = settings.adk_gemini_api_key
        self.model = settings.classify_model
        self.client = genai.Client(api_key=self.api_key)
        self._buffers: dict[str, bytearray] = {}
        self._last_classify: dict[str, float] = {}
        self._classify_lock: dict[str, asyncio.Lock] = {}

        log.info(
            "[RUNTIME] GeminiClassifyRuntime initialized | model=%s | interval=%.1fs",
            self.model,
            CLASSIFY_INTERVAL,
        )

    async def ingest_audio(
        self,
        session: AudioSession,
        chunk: AudioChunkMessage,
    ) -> Optional[ClassifiedFrame]:
        """Buffer audio chunk. Every CLASSIFY_INTERVAL, classify the buffer."""
        decoded = build_audio_decoder(chunk).decode(chunk)

        if not self.api_key:
            raise RuntimeError("Missing GEMINI_API_KEY.")

        key = session.user_id
        if key not in self._buffers:
            self._buffers[key] = bytearray()
            self._last_classify[key] = time.time()
            self._classify_lock[key] = asyncio.Lock()

        self._buffers[key].extend(decoded.raw_bytes)
        session.register_chunk()

        # Check if it's time to classify
        now = time.time()
        elapsed = now - self._last_classify[key]
        if elapsed < CLASSIFY_INTERVAL:
            return None

        # Don't run two classifies at once
        lock = self._classify_lock[key]
        if lock.locked():
            return None

        async with lock:
            # Take the buffer
            pcm_bytes = bytes(self._buffers[key])
            self._buffers[key].clear()
            self._last_classify[key] = now

            if len(pcm_bytes) < 3200:  # Less than 100ms of audio
                log.debug("[RUNTIME] Buffer too small, skipping classify")
                return None

            # Check RMS energy - skip silent audio
            rms = _pcm_rms(pcm_bytes)
            if rms < 300:
                log.debug("[RUNTIME] Quiet audio (RMS=%.0f), skipping classify", rms)
                return None

            log.info(
                "[RUNTIME] Classifying %.1fs of audio (RMS=%.0f) | user=%s",
                len(pcm_bytes) / (SAMPLE_RATE * 2),
                rms,
                key,
            )

            # Wrap PCM in WAV for Gemini
            wav_bytes = _pcm_to_wav(pcm_bytes)

            # Call Gemini
            return await self._classify(session, wav_bytes)

    async def _classify(
        self,
        session: AudioSession,
        wav_bytes: bytes,
    ) -> Optional[ClassifiedFrame]:
        """Send audio to Gemini and parse the classification response."""
        start = time.time()

        prompt = CLASSIFY_PROMPT.format(user_name=session.user_name)

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part(
                                inline_data=types.Blob(
                                    data=wav_bytes,
                                    mime_type="audio/wav",
                                )
                            ),
                            types.Part(text=prompt),
                        ],
                    )
                ],
            )
        except Exception as exc:
            log.error("[RUNTIME] Gemini API call failed: %s", exc)
            return None

        elapsed_ms = int((time.time() - start) * 1000)
        raw_text = (response.text or "").strip()

        log.info(
            "[RUNTIME] Gemini responded in %dms | raw=%r",
            elapsed_ms,
            raw_text[:200],
        )

        if not raw_text:
            return None

        return _parse_response(raw_text)

    async def close_session(self, session: AudioSession) -> None:
        key = session.user_id
        self._buffers.pop(key, None)
        self._last_classify.pop(key, None)
        self._classify_lock.pop(key, None)
        log.info("[RUNTIME] Session cleaned up | user=%s", key)

    async def shutdown(self) -> None:
        self._buffers.clear()
        self._last_classify.clear()


def _pcm_rms(pcm_bytes: bytes) -> float:
    """Compute RMS energy of PCM16 audio."""
    n_samples = len(pcm_bytes) // 2
    if n_samples == 0:
        return 0.0
    samples = struct.unpack(f"<{n_samples}h", pcm_bytes[: n_samples * 2])
    sq_sum = sum(s * s for s in samples)
    return (sq_sum / n_samples) ** 0.5


def _pcm_to_wav(pcm_bytes: bytes) -> bytes:
    """Wrap raw PCM16 bytes in a WAV header."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


# ── Ignore list: responses that mean "nothing interesting" ──
_IGNORE_PHRASES = [
    "ambient", "silence", "nothing", "quiet", "no sound",
    "background noise", "i can't hear", "i don't hear",
    "i didn't hear", "no significant",
]


def _parse_response(text: str) -> Optional[ClassifiedFrame]:
    """
    Parse Gemini's text response into a ClassifiedFrame.
    Expected format: "SIREN: description" or "SPEECH: transcription" or "AMBIENT"
    Falls back to keyword detection.
    """
    lower = text.lower().strip()

    # Skip non-actionable responses
    for phrase in _IGNORE_PHRASES:
        if phrase in lower and "siren" not in lower and "emergency" not in lower:
            log.info("[RUNTIME] Dropped (ambient/silence): %r", text[:100])
            return None

    upper = text.upper().strip()

    # Check for keyword prefix
    if "SIREN" in upper[:20]:
        transcript = text.split(":", 1)[1].strip() if ":" in text else text
        return ClassifiedFrame(
            category="SIREN",
            transcript=transcript,
            confidence=0.85,
            raw_text=text,
        )

    if "SPEECH" in upper[:20]:
        transcript = text.split(":", 1)[1].strip() if ":" in text else text
        return ClassifiedFrame(
            category="SPEECH",
            transcript=transcript,
            confidence=0.85,
            raw_text=text,
        )

    if "AMBIENT" in upper[:20]:
        log.info("[RUNTIME] Classified as AMBIENT: %r", text[:100])
        return None

    # Fallback: siren-related keywords
    siren_keywords = [
        "siren", "ambulance", "fire truck", "fire engine", "police",
        "emergency vehicle", "alarm", "fire alarm", "emergency",
        "wailing", "horn",
    ]
    for kw in siren_keywords:
        if kw in lower:
            return ClassifiedFrame(
                category="SIREN",
                transcript=text,
                confidence=0.7,
                raw_text=text,
            )

    # Fallback: if it contains substantial text, treat as speech
    if len(text.strip()) > 15:
        return ClassifiedFrame(
            category="SPEECH",
            transcript=text,
            confidence=0.6,
            raw_text=text,
        )

    return None


def build_runtime() -> GeminiClassifyRuntime:
    return GeminiClassifyRuntime()
