from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.config import settings
from app.contracts import ScenarioName


_SESSION_SERVICE = InMemorySessionService()


def _load_agents():
    from agents.myindigo.agent import (
        alert_planner_agent,
        name_detection_agent,
        vehicle_sound_agent,
    )

    return vehicle_sound_agent, name_detection_agent, alert_planner_agent


def _coerce_json_object(raw_text: str) -> Dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def _serialize_part_payload(part: types.Part) -> List[str]:
    fragments: List[str] = []

    if getattr(part, "text", None):
        fragments.append(part.text)

    function_response = getattr(part, "function_response", None)
    if function_response and getattr(function_response, "response", None) is not None:
        fragments.append(json.dumps(function_response.response, ensure_ascii=True))

    function_call = getattr(part, "function_call", None)
    if function_call and getattr(function_call, "args", None) is not None:
        fragments.append(json.dumps(function_call.args, ensure_ascii=True))

    return fragments


def _content_to_text(content: Optional[types.Content]) -> str:
    if not content or not content.parts:
        return ""

    fragments: List[str] = []
    for part in content.parts:
        fragments.extend(_serialize_part_payload(part))
    return "\n".join(fragment for fragment in fragments if fragment).strip()


def _normalize_signal(signal: Any, scenario: ScenarioName) -> str:
    if isinstance(signal, str) and signal:
        return signal
    return "emergency_vehicle_siren" if scenario == "siren" else "name_called"


def _normalize_category(category: Any, scenario: ScenarioName) -> str:
    if category in {"emergency", "info", "routine"}:
        return category
    return "emergency" if scenario == "siren" else "info"


def _normalize_architect_mode(mode: Any, scenario: ScenarioName) -> str:
    if mode in {"emergency", "info", "awareness", "personalization"}:
        if scenario == "hospital" and mode == "personalization":
            return "info"
        return mode
    return "emergency" if scenario == "siren" else "info"


def _normalize_severity(severity: Any, scenario: ScenarioName) -> str:
    if severity in {"critical", "high", "medium", "low"}:
        return severity
    return "high" if scenario == "siren" else "medium"


def _normalize_signal_label(signal: str, scenario: ScenarioName) -> str:
    if signal:
        return signal.replace("_", " ")
    return "emergency vehicle" if scenario == "siren" else "name called"


def _normalize_action_list(
    actions: Any,
    *,
    fallback: List[str],
) -> List[str]:
    if isinstance(actions, list):
        cleaned = [str(action).strip() for action in actions if str(action).strip()]
        if cleaned:
            return cleaned
    return fallback


def _normalize_executor_actions(
    actions: Any,
    *,
    scenario: ScenarioName,
) -> List[Dict[str, str]]:
    if isinstance(actions, list):
        normalized: List[Dict[str, str]] = []
        for action in actions:
            if not isinstance(action, dict):
                continue
            action_id = str(action.get("id", "")).strip()
            label = str(action.get("label", "")).strip()
            if action_id and label:
                normalized.append({"id": action_id, "label": label})
        if normalized:
            return normalized

    return (
        [{"id": "open-map", "label": "Show map"}, {"id": "acknowledge", "label": "I'm OK"}]
        if scenario == "siren"
        else [{"id": "view-summary", "label": "View summary"}, {"id": "acknowledge", "label": "Got it"}]
    )


def _normalize_specialist_result(
    specialist_result: Dict[str, Any],
    *,
    scenario: ScenarioName,
) -> Dict[str, Any]:
    normalized = dict(specialist_result)
    normalized["signal"] = _normalize_signal(
        specialist_result.get("signal"),
        scenario,
    )
    normalized["category"] = _normalize_category(
        specialist_result.get("category"),
        scenario,
    )
    normalized["title"] = specialist_result.get(
        "title",
        "Emergency vehicle approaching" if scenario == "siren" else "Your name was called",
    )
    normalized["subtitle"] = specialist_result.get(
        "subtitle",
        "Move right and yield" if scenario == "siren" else "Go to Exam Room 3",
    )
    normalized["recommended_actions"] = _normalize_action_list(
        specialist_result.get("recommended_actions"),
        fallback=(
            ["Move right", "Check surroundings"]
            if scenario == "siren"
            else ["Read summary", "Go to destination"]
        ),
    )
    return normalized


def _normalize_planner_result(
    planner_result: Dict[str, Any],
    *,
    scenario: ScenarioName,
    specialist_result: Dict[str, Any],
) -> Dict[str, Any]:
    normalized = dict(planner_result)
    architect = dict(planner_result.get("architect") or {})
    executor = dict(planner_result.get("executor") or {})

    architect["mode"] = _normalize_architect_mode(
        architect.get("mode"),
        scenario,
    )
    architect["severity"] = _normalize_severity(
        architect.get("severity"),
        scenario,
    )
    architect["title"] = architect.get("title") or specialist_result["title"]
    architect["userMessage"] = architect.get("userMessage") or specialist_result["subtitle"]
    architect["recommendedActions"] = _normalize_action_list(
        architect.get("recommendedActions"),
        fallback=specialist_result["recommended_actions"],
    )
    architect["wearableSignal"] = architect.get(
        "wearableSignal",
        "strong-vibration" if scenario == "siren" else "standard-vibration",
    )
    architect["escalation"] = architect.get(
        "escalation",
        "notify-now" if scenario == "siren" else "surface-now",
    )

    executor["channel"] = executor.get("channel", "phone-and-wearable")
    executor["phoneTitle"] = executor.get("phoneTitle") or architect["title"]
    executor["phoneBody"] = executor.get("phoneBody") or architect["userMessage"]
    executor["wearableTitle"] = executor.get(
        "wearableTitle",
        "Emergency alert" if scenario == "siren" else "Name called",
    )
    executor["wearableBody"] = executor.get("wearableBody") or specialist_result["subtitle"]
    executor["vibration"] = executor.get(
        "vibration",
        "strong" if scenario == "siren" else "standard",
    )
    executor["actions"] = _normalize_executor_actions(
        executor.get("actions"),
        scenario=scenario,
    )

    normalized["architect"] = architect
    normalized["executor"] = executor
    return normalized


async def _run_agent_once(
    *,
    agent,
    user_id: str,
    prompt: str,
    state: Optional[Dict[str, Any]] = None,
) -> str:
    final_text = ""
    async with Runner(
        app_name=settings.adk_app_name,
        agent=agent,
        session_service=_SESSION_SERVICE,
    ) as runner:
        session = await _SESSION_SERVICE.create_session(
            app_name=settings.adk_app_name,
            user_id=user_id,
            session_id=str(uuid4()),
            state=state or {},
        )

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.UserContent(parts=[types.Part(text=prompt)]),
        ):
            if event.author == agent.name and event.is_final_response():
                candidate = _content_to_text(event.content)
                if candidate:
                    final_text = candidate

    if not final_text:
        raise RuntimeError(f"{agent.name} did not return a final text response.")

    return final_text


def _build_specialist_prompt(
    *,
    transcript: str,
    scenario: ScenarioName,
    user_name: str,
) -> str:
    if scenario == "siren":
        return f"""
Transcript: {transcript}
Scenario: emergency vehicle outdoors
User name: {user_name}
User state: on foot
Likely location: Chelsea, NYC
Direction hint: behind

Analyze this as a real-time sound safety event and return the JSON format exactly.
""".strip()

    return f"""
Transcript: {transcript}
Scenario: hospital public announcement
User name: {user_name}
Location type: hospital waiting room
Likely location: NYU Langone lobby

Analyze whether the user was called and return the JSON format exactly.
""".strip()


def _build_planner_prompt(
    *,
    transcript: str,
    scenario: ScenarioName,
    user_name: str,
    specialist_result: Dict[str, Any],
) -> str:
    return f"""
User name: {user_name}
Scenario: {scenario}
Transcript: {transcript}
Specialist result JSON:
{json.dumps(specialist_result, ensure_ascii=True)}

Convert this into the strict architect/executor JSON format exactly.
""".strip()


def _build_fallback_result(
    *,
    transcript: str,
    scenario: ScenarioName,
    specialist_result: Dict[str, Any],
    planner_result: Dict[str, Any],
) -> Dict[str, Any]:
    is_emergency = scenario == "siren"
    signal = specialist_result.get(
        "signal",
        "emergency_vehicle_siren" if is_emergency else "hospital_pa",
    )
    title = specialist_result.get(
        "title",
        "Emergency vehicle approaching" if is_emergency else "Your name was called",
    )
    subtitle = specialist_result.get(
        "subtitle",
        "Move right and yield" if is_emergency else "Go to Exam Room 3",
    )
    recommended_actions = specialist_result.get(
        "recommended_actions",
        ["Move right", "Check surroundings"]
        if is_emergency
        else ["Read summary", "Go to destination"],
    )

    architect = planner_result.get("architect") or {
        "mode": "emergency" if is_emergency else "info",
        "severity": "high" if is_emergency else "medium",
        "title": title,
        "userMessage": subtitle,
        "recommendedActions": recommended_actions,
        "wearableSignal": "strong-vibration" if is_emergency else "standard-vibration",
        "escalation": "notify-now" if is_emergency else "surface-now",
    }
    executor = planner_result.get("executor") or {
        "channel": "phone-and-wearable",
        "phoneTitle": title,
        "phoneBody": subtitle,
        "wearableTitle": title,
        "wearableBody": subtitle,
        "vibration": "strong" if is_emergency else "standard",
        "actions": (
            [{"id": "open-map", "label": "Show map"}, {"id": "acknowledge", "label": "I'm OK"}]
            if is_emergency
            else [{"id": "view-summary", "label": "View summary"}, {"id": "acknowledge", "label": "Got it"}]
        ),
    }

    return {
        "rawContext": {
            "scenarioHint": "emergency_vehicle" if is_emergency else "hospital_pa",
        },
        "context": {
            "scenarioLabel": "Emergency vehicle outdoors"
            if is_emergency
            else "Hospital public announcement",
            "locationLabel": "Chelsea, NYC" if is_emergency else "NYU Langone lobby",
            "environmentLabel": "street" if is_emergency else "hospital",
            "userSituation": "on_foot" if is_emergency else "waiting_room",
        },
        "observation": {
            "transcript": transcript,
            "detectedSignal": _normalize_signal(signal, scenario),
            "confidence": 0.92 if is_emergency else 0.9,
            "timestampIso": datetime.now(timezone.utc).isoformat(),
            "source": "microphone",
        },
        "dispatch": {
            "category": _normalize_category(
                specialist_result.get("category"),
                scenario,
            ),
            "signal": _normalize_signal(signal, scenario),
            "confidence": 0.92 if is_emergency else 0.9,
            "routeTo": "architect",
            "reasoning": specialist_result.get(
                "subtitle",
                f"Specialist agent analyzed the live {_normalize_signal_label(signal, scenario)} event.",
            ),
        },
        "architect": architect,
        "executor": executor,
        "trace": ["listen", "dispatch", "architect", "executor"],
    }


async def run_adk_reasoning(
    *,
    transcript: str,
    scenario: ScenarioName,
    user_name: str,
) -> Dict[str, Any]:
    if settings.adk_gemini_api_key:
        os.environ["GOOGLE_API_KEY"] = settings.adk_gemini_api_key
        os.environ.pop("GEMINI_API_KEY", None)

    vehicle_sound_agent, name_detection_agent, alert_planner_agent = _load_agents()

    specialist_agent = vehicle_sound_agent if scenario == "siren" else name_detection_agent
    specialist_prompt = _build_specialist_prompt(
        transcript=transcript,
        scenario=scenario,
        user_name=user_name,
    )
    specialist_text = await _run_agent_once(
        agent=specialist_agent,
        user_id=user_name,
        prompt=specialist_prompt,
        state={"scenario": scenario},
    )
    specialist_result = _normalize_specialist_result(
        _coerce_json_object(specialist_text),
        scenario=scenario,
    )

    planner_prompt = _build_planner_prompt(
        transcript=transcript,
        scenario=scenario,
        user_name=user_name,
        specialist_result=specialist_result,
    )
    planner_text = await _run_agent_once(
        agent=alert_planner_agent,
        user_id=user_name,
        prompt=planner_prompt,
        state={"scenario": scenario},
    )
    planner_result = _normalize_planner_result(
        _coerce_json_object(planner_text),
        scenario=scenario,
        specialist_result=specialist_result,
    )

    return _build_fallback_result(
        transcript=transcript,
        scenario=scenario,
        specialist_result=specialist_result,
        planner_result=planner_result,
    )
