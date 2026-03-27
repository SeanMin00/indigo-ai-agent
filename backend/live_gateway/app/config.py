from __future__ import annotations

import os


class GatewaySettings:
    def __init__(self) -> None:
        self.next_pipeline_url = os.getenv(
            "NEXT_PIPELINE_URL",
            "http://localhost:3000/api/live/ingest",
        )
        self.live_gateway_demo_mode = (
            os.getenv("LIVE_GATEWAY_DEMO_MODE", "true").lower() == "true"
        )
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


settings = GatewaySettings()
