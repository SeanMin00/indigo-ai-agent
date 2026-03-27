from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.config import settings
from app.contracts import ScenarioName
from app.session import LiveGatewaySession


@dataclass
class TranscriptEvent:
    transcript: str
    confidence: float
    scenario: ScenarioName


class BaseTranscriptProvider:
    async def ingest_chunk(
        self,
        session: LiveGatewaySession,
        _base64_audio: str,
    ) -> Optional[TranscriptEvent]:
        raise NotImplementedError


class FallbackTranscriptProvider(BaseTranscriptProvider):
    TRANSCRIPTS = {
        "siren": "I can hear a siren and a fire truck is approaching from behind.",
        "hospital": "Alex Kim, please proceed to Exam Room 3 now.",
    }

    async def ingest_chunk(
        self,
        session: LiveGatewaySession,
        _base64_audio: str,
    ) -> Optional[TranscriptEvent]:
        session.register_chunk()
        if not session.should_emit_transcript:
            return None

        session.mark_transcript_emitted()
        transcript = self.TRANSCRIPTS[session.scenario]
        return TranscriptEvent(
            transcript=transcript,
            confidence=0.96 if session.scenario == "siren" else 0.91,
            scenario=session.scenario,
        )


class GeminiLiveTranscriptProvider(BaseTranscriptProvider):
    """
    Placeholder for the real Gemini Live audio transport.

    Planned responsibilities:
    - accept raw audio chunks from the WebSocket session
    - stream them to Gemini Live
    - surface partial/final transcripts
    - emit transcript events only when a final segment is available
    """

    def __init__(self) -> None:
        self.api_key = settings.gemini_api_key
        self.model = settings.gemini_model

    async def ingest_chunk(
        self,
        session: LiveGatewaySession,
        base64_audio: str,
    ) -> Optional[TranscriptEvent]:
        del session
        del base64_audio
        raise NotImplementedError(
            "Gemini Live audio streaming is not wired yet. "
            "Use LIVE_GATEWAY_DEMO_MODE=true to exercise the pipeline scaffold."
        )


def build_transcript_provider() -> BaseTranscriptProvider:
    if settings.live_gateway_demo_mode:
        return FallbackTranscriptProvider()

    return GeminiLiveTranscriptProvider()
