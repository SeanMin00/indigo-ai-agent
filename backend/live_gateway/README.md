# Live Gateway

FastAPI + WebSocket scaffold for real-time audio ingestion.

Purpose:
- accept browser mic chunks over `ws://localhost:8001/ws`
- forward live transcripts or sound events into the existing Next.js pipeline
- emit teammate UI events: `sound_detected`, `agent_update`, `alert`

Current status:
- WebSocket contract is implemented
- Next.js pipeline bridge is implemented
- development transcript fallback is implemented
- Gemini Live transport is scaffolded but not wired yet

Run:

```bash
cd backend/live_gateway
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Environment:

- `NEXT_PIPELINE_URL` defaults to `http://localhost:3000/api/live/ingest`
- `LIVE_GATEWAY_DEMO_MODE` defaults to `true`
- `GEMINI_API_KEY` and `GEMINI_MODEL` are reserved for the upcoming Gemini Live adapter

Notes:
- In demo mode, the gateway emits a transcript after a few audio chunks so the rest of the pipeline can be exercised end to end.
- The next implementation step is replacing `FallbackTranscriptProvider` with a real Gemini Live session provider.
