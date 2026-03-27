# ai-service Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python FastAPI + Google ADK backend that receives browser audio via WebSocket, runs a multi-agent pipeline (DispatchAgent → VehicleSoundAgent / NameDetectionAgent) using Gemini, and streams real-time events back to drive the frontend.

**Architecture:** Browser sends audio chunks over WebSocket to FastAPI at :8001. FastAPI pipes audio to a Gemini Live session. DispatchAgent (coordinator) listens to the stream and delegates to specialist sub-agents. Each agent state change is broadcast as a JSON event back through the WebSocket to the browser. A demo endpoint simulates the same event sequence for fallback.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, google-adk, google-genai, websockets

**Hackathon constraint:** Demo is March 28 2026. Must work live. Target: sound → alert < 4 seconds. Demo fallback is required insurance.

---

## File Structure

```
ai-service/
├── pyproject.toml              # Dependencies + project config
├── .env                        # GEMINI_API_KEY (symlink or copy)
├── main.py                     # FastAPI app, WebSocket endpoint, demo endpoint
├── agents/
│   ├── __init__.py             # Exports root_agent
│   ├── dispatch_agent.py       # DispatchAgent (coordinator) — Gemini Live audio
│   ├── vehicle_sound_agent.py  # VehicleSoundAgent (sub-agent)
│   └── name_detection_agent.py # NameDetectionAgent (sub-agent)
├── ws_handler.py               # WebSocket session manager, event broadcaster
└── demo.py                     # Demo simulation endpoint (fallback)
```

**Frontend files to modify:**

- `src/hooks/useAudioCapture.ts` — ensure PCM 16kHz output (Gemini requirement)
- `src/hooks/useAgentWebSocket.ts` — no changes needed
- `src/components/DemoScreen.tsx` — minor: wire demo trigger to POST /demo/{scenario}

---

## Task 1: Python project scaffold + dependencies

**Files:**

- Create: `ai-service/pyproject.toml`
- Create: `ai-service/.env`
- Create: `ai-service/main.py`
- Create: `ai-service/agents/__init__.py`

- [ ] **Step 1: Create pyproject.toml**

```toml
[project]
name = "myindigo-ai-service"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "websockets>=14.0",
    "google-adk>=1.0.0",
    "google-genai>=1.0.0",
    "python-dotenv>=1.0.0",
]

[project.scripts]
serve = "uvicorn main:app --host 0.0.0.0 --port 8001 --reload"
```

- [ ] **Step 2: Create .env**

```env
GEMINI_API_KEY=AIzaSyATqM2ouydlCWdgO8xwucV2F2i2nJNl5a4
GEMINI_MODEL=gemini-2.5-flash
```

- [ ] **Step 3: Create minimal main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="myIndigo AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "myindigo-ai-service"}
```

- [ ] **Step 4: Create empty agents/**init**.py**

```python
# Agent exports will be added in Task 3
```

- [ ] **Step 5: Install dependencies and verify server starts**

```bash
cd ai-service
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Visit http://localhost:8001/health — expect `{"status": "ok", "service": "myindigo-ai-service"}`

- [ ] **Step 6: Commit**

```bash
git add ai-service/
git commit -m "feat(ai-service): scaffold Python FastAPI project with dependencies"
```

---

## Task 2: WebSocket handler + event broadcaster

**Files:**

- Create: `ai-service/ws_handler.py`
- Modify: `ai-service/main.py`

The WebSocket handler manages browser sessions: receives `init` and `audio_chunk` messages, and provides a `broadcast()` method to send events back (sound_detected, agent_update, alert).

- [ ] **Step 1: Create ws_handler.py**

```python
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect


@dataclass
class ClientSession:
    ws: WebSocket
    user_name: str = ""
    user_id: str = ""
    start_time: float = 0.0
    audio_queue: asyncio.Queue[bytes] = field(default_factory=asyncio.Queue)

    async def send_event(self, event: dict[str, Any]) -> None:
        await self.ws.send_json(event)

    async def send_sound_detected(self, text: str) -> None:
        elapsed = int((time.time() - self.start_time) * 1000) if self.start_time else 0
        await self.send_event({
            "type": "sound_detected",
            "text": text,
            "latency_ms": elapsed,
        })

    async def send_agent_update(
        self, agent: str, status: str, output: str
    ) -> None:
        await self.send_event({
            "type": "agent_update",
            "agent": agent,
            "status": status,
            "output": output,
        })

    async def send_alert(
        self,
        scenario: str,
        title: str,
        subtitle: str,
        risk: str,
    ) -> None:
        await self.send_event({
            "type": "alert",
            "scenario": scenario,
            "title": title,
            "subtitle": subtitle,
            "risk": risk,
        })


async def handle_ws_connection(ws: WebSocket) -> ClientSession:
    """Accept WebSocket, wait for init message, return ClientSession."""
    await ws.accept()
    raw = await ws.receive_text()
    msg = json.loads(raw)

    if msg.get("type") != "init":
        await ws.close(code=4000, reason="Expected init message")
        raise WebSocketDisconnect(code=4000)

    session = ClientSession(
        ws=ws,
        user_name=msg.get("user_name", "User"),
        user_id=msg.get("user_id", ""),
        start_time=time.time(),
    )
    return session


async def read_audio_loop(session: ClientSession) -> None:
    """Read audio_chunk messages from browser and queue raw bytes."""
    try:
        while True:
            raw = await session.ws.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "audio_chunk":
                import base64
                audio_bytes = base64.b64decode(msg["data"])
                await session.audio_queue.put(audio_bytes)
    except WebSocketDisconnect:
        pass
```

- [ ] **Step 2: Add WebSocket endpoint to main.py**

Add these imports and route to `main.py`:

```python
from fastapi import WebSocket
from ws_handler import handle_ws_connection, read_audio_loop, ClientSession

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    session = await handle_ws_connection(ws)

    # For now, just echo that we're connected and read audio
    await session.send_event({"type": "agent_update", "agent": "dispatch", "status": "active", "output": "DispatchAgent listening..."})

    await read_audio_loop(session)
```

- [ ] **Step 3: Test WebSocket with browser**

Start ai-service, then open browser console:

```javascript
const ws = new WebSocket("ws://localhost:8001/ws");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.onopen = () =>
  ws.send(JSON.stringify({ type: "init", user_name: "Alex", user_id: "test" }));
```

Expect to see: `{type: "agent_update", agent: "dispatch", status: "active", output: "DispatchAgent listening..."}`

- [ ] **Step 4: Commit**

```bash
git add ai-service/ws_handler.py ai-service/main.py
git commit -m "feat(ai-service): WebSocket handler with event broadcaster"
```

---

## Task 3: ADK agents — DispatchAgent + sub-agents

**Files:**

- Create: `ai-service/agents/dispatch_agent.py`
- Create: `ai-service/agents/vehicle_sound_agent.py`
- Create: `ai-service/agents/name_detection_agent.py`
- Modify: `ai-service/agents/__init__.py`

These are Google ADK `LlmAgent` definitions. The DispatchAgent is the coordinator with two sub-agents. When Gemini detects a siren or a name in audio, the coordinator delegates to the appropriate specialist.

- [ ] **Step 1: Create vehicle_sound_agent.py**

```python
from google.adk.agents import LlmAgent

vehicle_sound_agent = LlmAgent(
    name="vehicle_sound_agent",
    model="gemini-2.5-flash",
    description="Analyzes vehicle/emergency sounds and scores risk. Called when DispatchAgent detects siren, horn, or crash sounds.",
    instruction="""You are VehicleSoundAgent. You receive a description of a detected vehicle sound.

Respond with ONLY a JSON object — no markdown, no explanation:
{
  "sound": "siren|horn|crash",
  "vehicle_type": "fire_engine|ambulance|police|unknown",
  "risk": "HIGH|MEDIUM|LOW",
  "title": "short alert title",
  "subtitle": "one-line action for the user",
  "direction": "behind|ahead|left|right|unknown"
}
""",
)
```

- [ ] **Step 2: Create name_detection_agent.py**

```python
from google.adk.agents import LlmAgent

name_detection_agent = LlmAgent(
    name="name_detection_agent",
    model="gemini-2.5-flash",
    description="Checks if the user's registered name was mentioned in a PA announcement and extracts location details. Called when DispatchAgent hears a public announcement.",
    instruction="""You are NameDetectionAgent. You receive a transcription of a public announcement and the user's registered name.

Check if the user's name was mentioned. Respond with ONLY a JSON object — no markdown, no explanation:
{
  "name_found": true|false,
  "title": "Your name was called" or "Not for you",
  "subtitle": "location or instruction from the announcement",
  "location_detail": "extracted room/gate/floor info"
}
""",
)
```

- [ ] **Step 3: Create dispatch_agent.py**

```python
from google.adk.agents import LlmAgent
from agents.vehicle_sound_agent import vehicle_sound_agent
from agents.name_detection_agent import name_detection_agent

dispatch_agent = LlmAgent(
    name="dispatch_agent",
    model="gemini-2.5-flash",
    description="Always-on coordinator. Listens to audio, classifies sounds, and delegates to specialist sub-agents.",
    instruction="""You are DispatchAgent for myIndigo, an accessibility app for deaf/hard-of-hearing users.

You receive real-time audio input. Your job:

1. LISTEN for two types of important sounds:
   a) Emergency vehicle sounds (sirens, horns, crashes)
   b) Public announcements that mention a person's name

2. When you detect an emergency vehicle sound:
   - Say what you detected (e.g. "I hear a siren approaching")
   - Delegate to vehicle_sound_agent with a description of what you heard

3. When you detect a PA announcement mentioning a name:
   - Say what you heard (e.g. "I heard an announcement mentioning Alex Kim")
   - Delegate to name_detection_agent with the transcript and the user's name

4. For ambient/unimportant sounds: stay silent and keep listening.

The user's registered name is provided in the session context. Be responsive — speed matters. Classify quickly and delegate immediately.
""",
    sub_agents=[vehicle_sound_agent, name_detection_agent],
)
```

- [ ] **Step 4: Update agents/**init**.py**

```python
from agents.dispatch_agent import dispatch_agent

root_agent = dispatch_agent
```

- [ ] **Step 5: Verify agents import without error**

```bash
cd ai-service
python -c "from agents import root_agent; print(root_agent.name)"
```

Expected output: `dispatch_agent`

- [ ] **Step 6: Commit**

```bash
git add ai-service/agents/
git commit -m "feat(ai-service): ADK agents — DispatchAgent + VehicleSoundAgent + NameDetectionAgent"
```

---

## Task 4: Wire ADK runner to WebSocket audio stream

**Files:**

- Modify: `ai-service/main.py`
- Modify: `ai-service/ws_handler.py`

This is the critical integration: browser audio → Gemini Live via ADK runner → parse agent events → broadcast to browser.

- [ ] **Step 1: Create the agent runner integration in main.py**

Replace the websocket_endpoint with the full pipeline:

```python
import asyncio
import json
import os

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

from agents import root_agent
from ws_handler import handle_ws_connection, read_audio_loop, ClientSession

load_dotenv()

app = FastAPI(title="myIndigo AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_service = InMemorySessionService()

runner = Runner(
    agent=root_agent,
    app_name="myindigo",
    session_service=session_service,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "myindigo-ai-service"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    client = await handle_ws_connection(ws)

    # Create ADK session with user context
    adk_session = await session_service.create_session(
        app_name="myindigo",
        user_id=client.user_id,
        state={"user_name": client.user_name},
    )

    # Notify frontend: dispatch is listening
    await client.send_agent_update("dispatch", "active", "DispatchAgent listening — Gemini Live connected")

    # Start reading browser audio in background
    audio_task = asyncio.create_task(read_audio_loop(client))

    try:
        # Run ADK live session with audio streaming
        live_events = runner.run_live(
            session=adk_session,
            live_request_queue=client.audio_queue,
        )

        async for event in live_events:
            await process_adk_event(client, event)

    except Exception as e:
        print(f"[myIndigo] ADK session error: {e}")
        await client.send_event({"type": "error", "message": str(e)})
    finally:
        audio_task.cancel()


async def process_adk_event(client: ClientSession, event: object) -> None:
    """Parse ADK event and broadcast appropriate WebSocket messages."""
    # ADK events have .author (agent name) and .content (Parts)
    author = getattr(event, "author", "")
    content = getattr(event, "content", None)

    if not content or not hasattr(content, "parts"):
        return

    text = ""
    for part in content.parts:
        if hasattr(part, "text") and part.text:
            text += part.text

    if not text.strip():
        return

    # Route based on which agent produced the event
    if author == "dispatch_agent":
        # Dispatch agent is classifying
        if any(kw in text.lower() for kw in ["siren", "horn", "crash", "emergency"]):
            await client.send_sound_detected(text.strip())
            await client.send_agent_update("dispatch", "done", text.strip())
        elif any(kw in text.lower() for kw in ["announcement", "name", "paging"]):
            await client.send_sound_detected(text.strip())
            await client.send_agent_update("dispatch", "done", text.strip())

    elif author == "vehicle_sound_agent":
        await client.send_agent_update("vehicle", "active", "VehicleSoundAgent analyzing...")
        # Try to parse JSON output
        try:
            data = json.loads(text.strip())
            await client.send_agent_update("vehicle", "done", f"Risk: {data.get('risk', 'UNKNOWN')}")
            await client.send_alert(
                scenario="siren",
                title=data.get("title", "Emergency vehicle detected"),
                subtitle=data.get("subtitle", "Check your surroundings"),
                risk=data.get("risk", "HIGH"),
            )
        except json.JSONDecodeError:
            await client.send_agent_update("vehicle", "done", text.strip())

    elif author == "name_detection_agent":
        await client.send_agent_update("name", "active", "NameDetectionAgent checking...")
        try:
            data = json.loads(text.strip())
            if data.get("name_found"):
                await client.send_agent_update("name", "done", f"Name confirmed — {data.get('location_detail', '')}")
                await client.send_alert(
                    scenario="name",
                    title=data.get("title", "Your name was called"),
                    subtitle=data.get("subtitle", ""),
                    risk="MEDIUM",
                )
            else:
                await client.send_agent_update("name", "done", "Not for you — resuming")
        except json.JSONDecodeError:
            await client.send_agent_update("name", "done", text.strip())
```

- [ ] **Step 2: Update ws_handler.py audio queue to emit Gemini-compatible format**

Add a helper to convert raw audio bytes to the format ADK `run_live` expects:

```python
from google.genai import types


def audio_blob(raw_bytes: bytes) -> types.Blob:
    """Wrap raw PCM bytes into a Gemini-compatible Blob."""
    return types.Blob(data=raw_bytes, mime_type="audio/pcm;rate=16000")
```

Update `read_audio_loop` to put blobs instead of raw bytes:

```python
async def read_audio_loop(session: ClientSession) -> None:
    """Read audio_chunk messages from browser and queue Gemini blobs."""
    try:
        while True:
            raw = await session.ws.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "audio_chunk":
                import base64
                audio_bytes = base64.b64decode(msg["data"])
                blob = audio_blob(audio_bytes)
                await session.audio_queue.put(blob)
    except WebSocketDisconnect:
        pass
```

- [ ] **Step 3: Test end-to-end with browser**

Start ai-service: `uvicorn main:app --host 0.0.0.0 --port 8001 --reload`
Start Next.js: `npm run dev`
Open browser → click "Go live" → allow microphone → play a siren sound from phone/speaker near laptop mic.
Watch agent panel steps light up in real time.

- [ ] **Step 4: Commit**

```bash
git add ai-service/main.py ai-service/ws_handler.py
git commit -m "feat(ai-service): wire ADK runner to WebSocket — live audio to Gemini pipeline"
```

---

## Task 5: Demo fallback endpoint

**Files:**

- Create: `ai-service/demo.py`
- Modify: `ai-service/main.py`

The demo endpoint simulates the same WebSocket event sequence for when live audio isn't available (required for hackathon fallback).

- [ ] **Step 1: Create demo.py**

```python
from __future__ import annotations

import asyncio
from typing import Any

from ws_handler import ClientSession


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

SCENARIOS = {"siren": SIREN_EVENTS, "name": NAME_EVENTS}


async def run_demo(session: ClientSession, scenario: str) -> None:
    """Stream simulated events to the client with realistic timing."""
    events = SCENARIOS.get(scenario, SIREN_EVENTS)
    for item in events:
        await asyncio.sleep(item["delay"])
        await session.send_event(item["event"])
```

- [ ] **Step 2: Add demo trigger routes to main.py**

Add these routes:

```python
from demo import run_demo, SCENARIOS

# Store active WebSocket sessions for demo triggering
active_sessions: dict[str, ClientSession] = {}

# In websocket_endpoint, after creating client session, add:
# active_sessions[client.user_id] = client

@app.post("/demo/{scenario}")
async def trigger_demo(scenario: str) -> dict[str, str]:
    if scenario not in SCENARIOS:
        return {"error": f"Unknown scenario: {scenario}. Use: {list(SCENARIOS.keys())}"}

    # Broadcast to all connected clients
    tasks = [run_demo(session, scenario) for session in active_sessions.values()]
    if tasks:
        await asyncio.gather(*tasks)
        return {"ok": "true", "scenario": scenario}
    return {"error": "No connected clients"}
```

- [ ] **Step 3: Test demo fallback**

With ai-service and Next.js running, browser connected via WebSocket:

```bash
curl -X POST http://localhost:8001/demo/siren
```

Watch frontend agent panel animate through the full sequence.

- [ ] **Step 4: Commit**

```bash
git add ai-service/demo.py ai-service/main.py
git commit -m "feat(ai-service): demo fallback endpoint — simulated event sequences"
```

---

## Task 6: Frontend audio format fix (PCM 16kHz)

**Files:**

- Modify: `src/hooks/useAudioCapture.ts`

Gemini Live API requires PCM 16-bit 16kHz mono. The current hook sends webm/opus. We need to use AudioWorklet or ScriptProcessorNode to output raw PCM.

- [ ] **Step 1: Rewrite useAudioCapture to output PCM 16kHz**

```typescript
"use client";

import { useRef, useState, useCallback } from "react";

type UseAudioCaptureOptions = {
  onChunk: (base64: string) => void;
  sampleRate?: number;
  chunkIntervalMs?: number;
};

export function useAudioCapture({
  onChunk,
  sampleRate = 16000,
  chunkIntervalMs = 500,
}: UseAudioCaptureOptions) {
  const [capturing, setCapturing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) return;

    // Merge all buffered chunks
    const totalLength = bufferRef.current.reduce((sum, b) => sum + b.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of bufferRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    bufferRef.current = [];

    // Convert float32 → int16 PCM
    const pcm = new Int16Array(merged.length);
    for (let i = 0; i < merged.length; i++) {
      const s = Math.max(-1, Math.min(1, merged[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Base64 encode
    const bytes = new Uint8Array(pcm.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    onChunk(btoa(binary));
  }, [onChunk]);

  const start = useCallback(async () => {
    if (capturing) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate, channelCount: 1, echoCancellation: true },
    });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate });
    contextRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const data = e.inputBuffer.getChannelData(0);
      bufferRef.current.push(new Float32Array(data));
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    intervalRef.current = setInterval(flush, chunkIntervalMs);
    setCapturing(true);
  }, [capturing, sampleRate, chunkIntervalMs, flush]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    flush();
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    bufferRef.current = [];
    setCapturing(false);
  }, [flush]);

  return { capturing, start, stop };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAudioCapture.ts
git commit -m "feat: useAudioCapture outputs PCM 16kHz for Gemini Live API"
```

---

## Task 7: Frontend demo trigger via POST

**Files:**

- Modify: `src/components/DemoScreen.tsx`

Wire the "Play demo" button to POST to ai-service `/demo/{scenario}` when connected, falling back to client-side simulation when offline.

- [ ] **Step 1: Update playDemo function in DemoScreen.tsx**

Replace the `playDemo` function:

```typescript
async function playDemo() {
  reset();
  setLocationText(sc === "siren" ? "Chelsea, NY 10011" : "NYU Langone — Lobby");

  if (sc === "siren") setRadarActive(true);

  if (connected) {
    // Trigger server-side demo — events come back via WebSocket
    const scenario = sc === "siren" ? "siren" : "name";
    try {
      await fetch(`http://localhost:8001/demo/${scenario}`, { method: "POST" });
    } catch {
      // Server unreachable, fall through to client-side sim
      runClientSim();
    }
  } else {
    runClientSim();
  }
}

function runClientSim() {
  const sim = sc === "siren" ? SIREN_SIM : HOSPITAL_SIM;
  const newTimers = sim.map(({ delay, msg }) =>
    setTimeout(() => handleMessage(msg), delay),
  );
  timersRef.current = newTimers;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DemoScreen.tsx
git commit -m "feat: demo button triggers server-side simulation when connected"
```

---

## Task Summary

| Task | What                                  | Priority     | Time est. |
| ---- | ------------------------------------- | ------------ | --------- |
| 1    | Python scaffold + deps                | Critical     | 10 min    |
| 2    | WebSocket handler + event broadcaster | Critical     | 15 min    |
| 3    | ADK agents (Dispatch + 2 specialists) | Critical     | 15 min    |
| 4    | Wire ADK runner to WebSocket audio    | Critical     | 30 min    |
| 5    | Demo fallback endpoint                | Critical     | 10 min    |
| 6    | Frontend PCM 16kHz audio fix          | Critical     | 10 min    |
| 7    | Frontend demo trigger via POST        | Nice-to-have | 5 min     |

**Total estimated: ~1.5 hours to working end-to-end demo.**

## Notes for implementation

- **ADK `run_live`** is the key API — it accepts an async queue of audio blobs and yields agent events. If the exact API signature differs at runtime, check `from google.adk.runners import Runner; help(Runner.run_live)`.
- **Gemini model for live audio**: Use `gemini-2.5-flash` for the DispatchAgent. If Live API requires a specific model variant (e.g., `gemini-2.5-flash-live`), update `dispatch_agent.py`.
- **If `run_live` doesn't work as documented**: Fall back to manually managing a `genai.Client().aio.live.connect()` session and feeding audio + parsing responses, then routing to sub-agents via separate `runner.run_async()` calls.
- **CORS**: The FastAPI WebSocket at :8001 needs to accept connections from :3000. The CORS middleware handles HTTP; WebSocket CORS is handled by the browser's same-origin check (which allows cross-origin WS by default).
