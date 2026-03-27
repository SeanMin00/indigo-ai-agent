from __future__ import annotations

import asyncio
import logging
from typing import Any

from ws_handler import ClientSession

log = logging.getLogger("myindigo")


SIREN_EVENTS: list[dict[str, Any]] = [
    {"delay": 0.6, "event": {"type": "sound_detected", "text": "Siren detected", "latency_ms": 620}},
    {"delay": 0.8, "event": {"type": "agent_update", "agent": "dispatch", "status": "active", "output": "DispatchAgent: \"this is a siren\" — classifying vehicle type"}},
    {"delay": 0.9, "event": {"type": "agent_update", "agent": "dispatch", "status": "done", "output": "Siren confirmed — high confidence"}},
    {"delay": 0.1, "event": {"type": "agent_update", "agent": "vehicle", "status": "active", "output": "VehicleSoundAgent: fire engine, approaching from rear"}},
    {"delay": 0.9, "event": {"type": "agent_update", "agent": "vehicle", "status": "done", "output": "Risk: HIGH — W 23rd, on foot, intersection"}},
    {"delay": 0.8, "event": {"type": "alert", "scenario": "siren", "title": "Emergency vehicle approaching", "subtitle": "Check surroundings and yield — W 23rd St", "risk": "HIGH"}},
]

NAME_EVENTS: list[dict[str, Any]] = [
    {"delay": 0.6, "event": {"type": "sound_detected", "text": "PA speech detected", "latency_ms": 810}},
    {"delay": 0.8, "event": {"type": "agent_update", "agent": "dispatch", "status": "active", "output": "DispatchAgent: \"announcement heard\" — scanning for name"}},
    {"delay": 0.9, "event": {"type": "agent_update", "agent": "dispatch", "status": "done", "output": "Name match found: Alex Kim"}},
    {"delay": 0.1, "event": {"type": "agent_update", "agent": "name", "status": "active", "output": "NameDetectionAgent: extracting location from announcement"}},
    {"delay": 0.9, "event": {"type": "agent_update", "agent": "name", "status": "done", "output": "Exam Room 3, 2nd floor — wayfinding: north wing"}},
    {"delay": 0.8, "event": {"type": "alert", "scenario": "name", "title": "Your name was called", "subtitle": "Exam Room 3 — 2nd floor north wing", "risk": "MEDIUM"}},
]

SCENARIOS: dict[str, list[dict[str, Any]]] = {
    "siren": SIREN_EVENTS,
    "name": NAME_EVENTS,
}


async def run_demo(session: ClientSession, scenario: str) -> None:
    """Stream simulated events to the client with realistic timing."""
    events = SCENARIOS.get(scenario, SIREN_EVENTS)
    log.info("🎬 Demo [%s] starting — %d events for user=%s", scenario, len(events), session.user_name)
    for i, item in enumerate(events):
        await asyncio.sleep(item["delay"])
        log.info("🎬 Demo [%s] event %d/%d: %s", scenario, i + 1, len(events), item["event"].get("type"))
        await session.send_event(item["event"])
    log.info("🎬 Demo [%s] complete", scenario)
