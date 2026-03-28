from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def _load_env_files() -> None:
    current = Path(__file__).resolve()
    candidates = [
        current.parents[1] / ".env.local",
        current.parents[1] / ".env",
        current.parents[3] / ".env.local",
        current.parents[3] / ".env",
    ]

    seen = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.exists():
            load_dotenv(candidate, override=False)


_load_env_files()


class ServiceSettings:
    def __init__(self) -> None:
        adk_key_candidates = [
            ("ADK_GEMINI_API_KEY", os.getenv("ADK_GEMINI_API_KEY", "")),
            ("GOOGLE_API_KEY", os.getenv("GOOGLE_API_KEY", "")),
            ("GEMINI_API_KEY", os.getenv("GEMINI_API_KEY", "")),
        ]
        self.adk_gemini_api_key = ""
        self.adk_gemini_api_key_source = "missing"
        for source, value in adk_key_candidates:
            if value:
                self.adk_gemini_api_key = value
                self.adk_gemini_api_key_source = source
                break

        self.classify_model = os.getenv(
            "CLASSIFY_MODEL", "gemini-2.5-flash"
        )
        self.adk_agent_model = os.getenv("ADK_AGENT_MODEL", "gemini-2.5-flash")
        self.adk_app_name = os.getenv("ADK_APP_NAME", "myindigo")
        self.confidence_threshold = float(
            os.getenv("CONFIDENCE_THRESHOLD", "0.5")
        )


settings = ServiceSettings()
