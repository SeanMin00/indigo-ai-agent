from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

from app.adk_runner import run_agent
from app.config import settings
from app.contracts import AudioCategory, ServerEvent
from app.runtime import ClassifiedFrame

log = logging.getLogger("myindigo.orchestrator")

# Debounce: don't fire the same scenario twice within this window
DEBOUNCE_SECONDS = 8
_last_alert: dict[str, float] = {}



async def dispatch_and_run(
    *,
    frame: ClassifiedFrame,
    user_name: str,
    send_event: Any,
) -> None:
    """
    Rule-based dispatch + ADK agent execution.

    1. Look at Gemini Live's classification (SIREN/SPEECH/AMBIENT)
    2. Route to the right ADK agent (or drop)
    3. Send WebSocket events as the pipeline progresses
    """
    category = frame.category
    transcript = frame.transcript
    confidence = frame.confidence

    log.info(
        "[DISPATCH] Received frame | category=%s | confidence=%.2f | transcript=%r",
        category,
        confidence,
        transcript[:100],
    )

    # ── Gate: confidence threshold ──
    if confidence < settings.confidence_threshold:
        log.info(
            "[DISPATCH] Dropped (low confidence %.2f < %.2f)",
            confidence,
            settings.confidence_threshold,
        )
        return

    # ── Gate: AMBIENT → drop ──
    if category == "AMBIENT":
        log.info("[DISPATCH] Dropped AMBIENT")
        return

    # ── Route: SIREN → SirenAgent ──
    if category == "SIREN":
        # Debounce
        now = time.time()
        if now - _last_alert.get("siren", 0) < DEBOUNCE_SECONDS:
            log.info("[DISPATCH] Debounced siren (within %ds window)", DEBOUNCE_SECONDS)
            return

        log.info("[DISPATCH] Routing to SirenAgent")
        await send_event({
            "type": "sound_detected",
            "text": transcript or "Emergency sound detected",
            "latency_ms": 0,
        })
        await send_event({
            "type": "agent_update",
            "agent": "dispatch",
            "status": "done",
            "output": f"Emergency sound detected (confidence: {confidence:.0%}) → SirenAgent",
        })
        await send_event({
            "type": "agent_update",
            "agent": "vehicle",
            "status": "active",
            "output": "Analyzing emergency sound...",
        })

        try:
            result = await run_agent(
                agent_name="siren",
                transcript=transcript,
                user_name=user_name,
            )
        except Exception as exc:
            log.error("[DISPATCH] SirenAgent failed: %s", exc)
            await send_event({
                "type": "agent_update",
                "agent": "vehicle",
                "status": "done",
                "output": f"Error: {exc}",
            })
            return

        confirmed = result.get("confirmed", False)
        await send_event({
            "type": "agent_update",
            "agent": "vehicle",
            "status": "done",
            "output": result.get("reason", "Analysis complete"),
        })

        if confirmed:
            _last_alert["siren"] = now
            log.info(
                "[DISPATCH] SirenAgent CONFIRMED | risk=%s | title=%r",
                result.get("risk"),
                result.get("title"),
            )
            await send_event({
                "type": "alert",
                "scenario": "siren",
                "icon": "🚨",
                "title": result.get("title", "Move to safety!"),
                "subtitle": result.get("subtitle", "Emergency vehicle nearby"),
                "action": result.get("action", "Step aside and stay alert"),
                "risk": result.get("risk", "HIGH"),
            })
        else:
            log.info(
                "[DISPATCH] SirenAgent REJECTED | reason=%r",
                result.get("reason"),
            )
        return

    # ── Route: SPEECH → Process ALL speech with SummaryAgent ──
    if category == "SPEECH":
        if not transcript:
            log.info("[DISPATCH] Dropped SPEECH (empty transcript)")
            return

        log.info("[DISPATCH] SPEECH detected | transcript=%r", transcript[:100])

        # Debounce
        now = time.time()
        if now - _last_alert.get("speech", 0) < DEBOUNCE_SECONDS:
            log.info("[DISPATCH] Debounced speech (within %ds window)", DEBOUNCE_SECONDS)
            return
        _last_alert["speech"] = now

        # Stage 1: sound detected
        await send_event({
            "type": "sound_detected",
            "text": f"Speech detected",
            "latency_ms": 0,
        })

        # Stage 2: dispatch classifies and routes
        await send_event({
            "type": "agent_update",
            "agent": "dispatch",
            "status": "done",
            "output": f"Speech detected (confidence: {confidence:.0%}) → SpeechSummaryAgent",
        })

        # Stage 3: specialist analyzing
        await send_event({
            "type": "agent_update",
            "agent": "summary",
            "status": "active",
            "output": "Analyzing speech...",
        })

        try:
            result = await run_agent(
                agent_name="summary",
                transcript=transcript,
                user_name=user_name,
            )
        except Exception as exc:
            log.error("[DISPATCH] SummaryAgent failed: %s", exc)
            await send_event({
                "type": "agent_update",
                "agent": "summary",
                "status": "done",
                "output": f"Error analyzing speech: {exc}",
            })
            return

        # Stage 4: specialist done
        await send_event({
            "type": "agent_update",
            "agent": "summary",
            "status": "done",
            "output": result.get("summary", "Speech analyzed"),
        })

        # Stage 5: Send alert with icon and summary
        await send_event({
            "type": "alert",
            "scenario": "speech",
            "icon": result.get("icon", "📋"),
            "title": result.get("title", "Announcement"),
            "subtitle": result.get("summary", transcript),
            "action": result.get("action"),
            "location": result.get("location"),
            "category": result.get("category", "routine_speech"),
            "risk": "LOW",
        })
        log.info("[DISPATCH] Speech summary alert sent | category=%s", result.get("category"))
        return
