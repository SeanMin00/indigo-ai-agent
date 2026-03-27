from __future__ import annotations

from typing import Literal, Optional, TypedDict

from pydantic import BaseModel


ScenarioName = Literal["siren", "hospital"]


class InitMessage(BaseModel):
    type: Literal["init"]
    user_name: str
    user_id: str
    scenario: Optional[ScenarioName] = None


class AudioChunkMessage(BaseModel):
    type: Literal["audio_chunk"]
    data: str


class SoundDetectedMessage(TypedDict):
    type: Literal["sound_detected"]
    text: str
    latency_ms: int


class AgentUpdateMessage(TypedDict):
    type: Literal["agent_update"]
    agent: str
    status: Literal["active", "done"]
    output: str


class AlertMessage(TypedDict):
    type: Literal["alert"]
    scenario: Literal["siren", "name"]
    title: str
    subtitle: str
    risk: str


ServerMessage = SoundDetectedMessage | AgentUpdateMessage | AlertMessage
