"""
Test script to debug name detection pipeline.
Tests each stage independently:
  1. Name agent directly (with known transcripts)
  2. Classification prompt (with synthetic audio-like text)
  3. End-to-end pipeline
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import logging

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("test")

from google import genai
from google.genai import types as genai_types
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from agents.name_detection_agent import name_detection_agent
from agents.vehicle_sound_agent import vehicle_sound_agent

api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
gemini_client = genai.Client(api_key=api_key)

session_service = InMemorySessionService()
name_runner = Runner(
    agent=name_detection_agent,
    app_name="test_name",
    session_service=session_service,
)


# ── Test 1: NameDetectionAgent with known transcripts ──────

TEST_TRANSCRIPTS = [
    # (transcript, user_name, expected_name_found)
    ("Alex Kim, please report to Gate B12 for boarding", "Alex Kim", True),
    ("Alex, your order is ready at counter 5", "Alex Kim", True),
    ("Hey Alex come to room 302", "Alex Kim", True),
    ("Attention passengers, flight 302 is now boarding", "Alex Kim", False),
    ("Paging Alex Kim to the front desk", "Alex Kim", True),
    ("Could Alex please come to the information counter", "Alex Kim", True),
    ("The weather today will be sunny", "Alex Kim", False),
    ("Alec, please come to gate 4", "Alex Kim", True),  # close name match
]


async def test_name_agent_directly() -> None:
    """Test the NameDetectionAgent with known transcripts."""
    print("\n" + "=" * 70)
    print("TEST 1: NameDetectionAgent — direct calls with known transcripts")
    print("=" * 70)

    passed = 0
    failed = 0

    for i, (transcript, user_name, expected) in enumerate(TEST_TRANSCRIPTS):
        print(f"\n--- Test {i+1}: transcript=\"{transcript}\"")
        print(f"    user_name=\"{user_name}\", expected name_found={expected}")

        try:
            sub_session = await session_service.create_session(
                app_name="test_name",
                user_id=f"test-user-{i}",
            )

            prompt = (
                f'Transcript of speech/announcement: "{transcript}"\n'
                f'User\'s registered name: "{user_name}"\n'
                f"Check if this person's name was mentioned. Respond with JSON only."
            )
            print(f"    PROMPT: {prompt}")

            content = genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=prompt)],
            )

            text = ""
            async for event in name_runner.run_async(
                session_id=sub_session.id,
                user_id=f"test-user-{i}",
                new_message=content,
            ):
                ec = getattr(event, "content", None)
                if ec and hasattr(ec, "parts"):
                    for p in ec.parts:
                        if hasattr(p, "text") and p.text:
                            text += p.text

                # Debug: print all event types
                print(f"    EVENT: author={getattr(event, 'author', '?')} "
                      f"type={type(event).__name__} "
                      f"content_preview={str(getattr(event, 'content', ''))[:100]}")

            print(f"    RAW OUTPUT: {text!r}")

            # Strip markdown fences
            clean = re.sub(r"^```(?:json)?\s*", "", text.strip())
            clean = re.sub(r"\s*```$", "", clean)
            print(f"    CLEANED: {clean!r}")

            try:
                data = json.loads(clean)
                actual = data.get("name_found", False)
                status = "PASS" if actual == expected else "FAIL"
                if status == "FAIL":
                    failed += 1
                else:
                    passed += 1
                print(f"    PARSED JSON: {json.dumps(data, indent=2)}")
                print(f"    RESULT: {status} — name_found={actual} (expected {expected})")
            except json.JSONDecodeError as e:
                failed += 1
                print(f"    JSON PARSE ERROR: {e}")
                print(f"    RESULT: FAIL — could not parse JSON")

        except Exception as e:
            failed += 1
            print(f"    ERROR: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()

        # Small delay to avoid rate limits
        await asyncio.sleep(2)

    print(f"\n{'=' * 70}")
    print(f"TEST 1 SUMMARY: {passed} passed, {failed} failed out of {len(TEST_TRANSCRIPTS)}")
    print(f"{'=' * 70}")
    return failed == 0


# ── Test 2: Classification prompt with text-only ───────────

CLASSIFY_TEST_CASES = [
    # (text simulating what Gemini would "hear", user_name, expected_category)
    ("Alex Kim please come to gate B12", "Alex Kim", "NAME_CALLED"),
    ("Hey Alex your order is ready", "Alex Kim", "NAME_CALLED"),
    ("The next train departs at 3pm", "Alex Kim", "SPEECH"),
    ("Paging doctor Kim to room 5", "Alex Kim", "NAME_CALLED"),
]


async def test_classification_prompt() -> None:
    """Test the classification prompt logic with text input."""
    print("\n" + "=" * 70)
    print("TEST 2: Classification prompt — text-based simulation")
    print("=" * 70)

    for i, (text_input, user_name, expected_cat) in enumerate(CLASSIFY_TEST_CASES):
        print(f"\n--- Test {i+1}: input=\"{text_input}\"")
        print(f"    user_name=\"{user_name}\", expected_category={expected_cat}")

        prompt = (
            f'IMPORTANT: The user is deaf/hard-of-hearing. '
            f'Their name is "{user_name}" '
            f'(first name: "{user_name.split()[0]}"). '
            f'Missing a name call is DANGEROUS — if in doubt, choose NAME_CALLED.\n\n'
            "You are given text that represents what was heard in audio. "
            "Classify it.\n\n"
            "Respond with ONLY a JSON object (no markdown, no explanation):\n"
            '{"category": "SIREN"|"NAME_CALLED"|"SPEECH"|"AMBIENT", "transcript": "..."}\n\n'
            "Categories (check in this order):\n"
            "1. SIREN — siren, horn, alarm, or emergency vehicle sound\n"
            f'2. NAME_CALLED — speech that contains "{user_name}", '
            f'"{user_name.split()[0]}", or anything that sounds similar '
            f'(e.g. "Alex", "Alec", "Kim", "A. Kim"). '
            f"Be GENEROUS — partial matches, nicknames, and slight "
            f"mispronunciations all count.\n"
            "3. SPEECH — human speech where the user's name is definitely NOT said\n"
            "4. AMBIENT — silence, background noise, nothing notable\n\n"
            f"Text heard: \"{text_input}\""
        )

        try:
            response = await gemini_client.aio.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    genai_types.Content(
                        role="user",
                        parts=[genai_types.Part(text=prompt)],
                    )
                ],
            )
            raw = response.text.strip() if response.text else ""
            clean = re.sub(r"^```(?:json)?\s*", "", raw)
            clean = re.sub(r"\s*```$", "", clean)
            print(f"    RAW: {raw!r}")
            print(f"    CLEANED: {clean!r}")

            data = json.loads(clean)
            actual = data.get("category", "UNKNOWN")
            status = "PASS" if actual == expected_cat else "FAIL"
            print(f"    PARSED: {json.dumps(data)}")
            print(f"    RESULT: {status} — category={actual} (expected {expected_cat})")
        except Exception as e:
            print(f"    ERROR: {type(e).__name__}: {e}")

        await asyncio.sleep(2)


# ── Test 3: Check debounce and flow logic ──────────────────

def test_debounce_logic() -> None:
    """Verify debounce logic doesn't have bugs."""
    print("\n" + "=" * 70)
    print("TEST 3: Debounce logic check")
    print("=" * 70)

    import time
    DEBOUNCE_SECS = 10
    _last_dispatch: dict[str, float] = {}

    # Simulate NAME_CALLED at t=0
    now = 0.0
    _last_dispatch["name"] = now
    print(f"  t=0: NAME_CALLED dispatched, _last_dispatch={_last_dispatch}")

    # Simulate SPEECH at t=5 — should be debounced
    now = 5.0
    if now - _last_dispatch.get("name", 0) < DEBOUNCE_SECS:
        print(f"  t=5: SPEECH would be DEBOUNCED (correct — within 10s of name)")
    else:
        print(f"  t=5: SPEECH would NOT be debounced (BUG!)")

    # BUG CHECK: SPEECH sets _last_dispatch["speech"] not ["name"]
    # So subsequent SPEECH won't be debounced by previous SPEECH
    _last_dispatch["speech"] = now
    print(f"  After SPEECH: _last_dispatch={_last_dispatch}")
    print(f"  NOTE: SPEECH sets 'speech' key, but debounce checks 'name' key!")
    print(f"  This means SPEECH-after-SPEECH won't be debounced (potential bug)")

    # Simulate SPEECH at t=12 — should NOT be debounced by name (>10s)
    now = 12.0
    if now - _last_dispatch.get("name", 0) < DEBOUNCE_SECS:
        print(f"  t=12: SPEECH debounced by name (unexpected)")
    else:
        print(f"  t=12: SPEECH NOT debounced (correct — >10s since name)")

    # But _last_dispatch["speech"] was set at t=5, and speech debounce checks "name" key
    # So even rapid SPEECH events won't debounce each other
    print(f"\n  VERDICT: SPEECH debounce has a key mismatch bug.")
    print(f"  Line 279 sets _last_dispatch['speech'] but line 275 checks _last_dispatch['name']")


async def main() -> None:
    print("=" * 70)
    print("  myIndigo Name Detection Debug Test Suite")
    print("=" * 70)

    # Test 3 first — no API calls needed
    test_debounce_logic()

    # Test 1 — direct agent calls
    await test_name_agent_directly()

    # Test 2 — classification prompt
    await test_classification_prompt()


if __name__ == "__main__":
    asyncio.run(main())
