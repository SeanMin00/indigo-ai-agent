from __future__ import annotations

from typing import Any

import httpx

from app.config import settings
from app.contracts import ScenarioName, ServerMessage


def build_raw_context(scenario: ScenarioName) -> dict[str, Any]:
    if scenario == "hospital":
        return {
            "scenarioHint": "hospital_pa",
            "city": "New York City",
            "neighborhood": "Midtown East",
            "venueType": "hospital",
            "userSituationHint": "waiting_room",
            "timeHint": "morning",
            "weatherHint": "clear",
            "notes": ["Hospital lobby", "Realtime assistive announcement flow"],
        }

    return {
        "scenarioHint": "emergency_vehicle",
        "city": "New York City",
        "neighborhood": "Chelsea",
        "venueType": "street",
        "userSituationHint": "on_foot",
        "timeHint": "afternoon",
        "weatherHint": "clear",
        "notes": ["Outdoor demo route", "Realtime hazard awareness flow"],
    }


async def call_next_pipeline(
    *,
    transcript: str,
    confidence: float,
    scenario: ScenarioName,
) -> dict[str, Any]:
    body = {
        "listenInput": {
            "transcript": transcript,
            "source": "microphone",
            "confidenceHint": confidence,
        },
        "rawContext": build_raw_context(scenario),
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(settings.next_pipeline_url, json=body)
        response.raise_for_status()
        payload = response.json()

    if not payload.get("ok"):
        raise RuntimeError(payload.get("error", "Unknown pipeline bridge error."))

    return payload["result"]


def map_pipeline_result_to_messages(
    result: dict[str, Any],
    scenario: ScenarioName,
) -> list[ServerMessage]:
    architect = result["architect"]
    dispatch = result["dispatch"]
    executor = result["executor"]
    observation = result["observation"]

    specialist_agent = "vehicle" if architect["mode"] == "emergency" else "name"
    first_action = architect["recommendedActions"][0] if architect["recommendedActions"] else "Check details"
    alert_scenario = "name" if scenario == "hospital" else "siren"

    return [
        {
            "type": "sound_detected",
            "text": observation["detectedSignal"].replace("_", " "),
            "latency_ms": round(float(observation["confidence"]) * 1000),
        },
        {
            "type": "agent_update",
            "agent": "dispatch",
            "status": "active",
            "output": f'DispatchAgent: classifying {dispatch["signal"]}',
        },
        {
            "type": "agent_update",
            "agent": "dispatch",
            "status": "done",
            "output": dispatch["reasoning"],
        },
        {
            "type": "agent_update",
            "agent": specialist_agent,
            "status": "active",
            "output": f'{architect["mode"]} architect: evaluating context and next action',
        },
        {
            "type": "agent_update",
            "agent": specialist_agent,
            "status": "done",
            "output": f'{architect["title"]} - {first_action}',
        },
        {
            "type": "alert",
            "scenario": alert_scenario,
            "title": executor["phoneTitle"],
            "subtitle": executor["phoneBody"],
            "risk": architect["severity"].upper(),
        },
    ]
