from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.contracts import ScenarioName


@dataclass
class LiveGatewaySession:
    user_name: str
    user_id: str
    scenario: ScenarioName = "siren"
    chunk_count: int = 0
    emitted_transcript: bool = False
    partial_transcript: Optional[str] = None
    notes: list[str] = field(default_factory=list)

    def register_chunk(self) -> None:
        self.chunk_count += 1

    @property
    def should_emit_transcript(self) -> bool:
        return self.chunk_count >= 3 and not self.emitted_transcript

    def mark_transcript_emitted(self) -> None:
        self.emitted_transcript = True
