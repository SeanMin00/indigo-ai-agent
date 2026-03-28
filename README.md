# myIndigo

Real-time audio awareness agent for deaf and hard-of-hearing users, built with Google Gemini and ADK.

**NYC Build With AI Hackathon @ NYU Tandon — March 2026**

## What it does

myIndigo listens to the world for you. It uses your phone's microphone to detect critical sounds and instantly alerts you on your phone and Apple Watch with clear, actionable instructions.

**Two scenarios:**

- **Emergency sirens** — Detects fire trucks, ambulances, police sirens and tells you exactly what to do ("Move to the right! Fire truck approaching from behind")
- **Subway announcements** — Transcribes transit PA announcements and tells you what action to take ("Your stop is next! Get ready to exit")

## How it works

```
Microphone (browser)
    |  PCM16 audio @ 16kHz
    v
WebSocket --> Python FastAPI backend
    |
    v
+----------------------------------+
|  Gemini 2.5 Flash (multimodal)   |
|  Audio classification +          |
|  transcription                   |
|  "Is this a siren or speech?"    |
+----------+-----------------------+
           |
     +-----+-----+
     |           |
   SIREN      SPEECH
     |           |
     v           v
+----------+ +---------------+
| SirenAgent | SummaryAgent  |
| (ADK)    | | (ADK)         |
| Confirms | | Categorizes   |
| + action | | + action      |
+----+-----+ +------+--------+
     |              |
     v              v
  WebSocket --> Phone + Watch alert
```

**Audio in, action out.** Gemini processes raw audio (multimodal), ADK agents reason about it, and the user gets a clear instruction on their device in seconds.

## Tech stack

| Layer            | Technology                             |
| ---------------- | -------------------------------------- |
| Frontend         | Next.js 14 + TypeScript                |
| Backend          | Python 3.11 + FastAPI                  |
| AI Orchestration | Google ADK (Agent Development Kit)     |
| AI Model         | Gemini 2.5 Flash (Google GenAI SDK)    |
| Real-time        | WebSocket (browser <-> Python backend) |
| Audio Capture    | Web Audio API, PCM16 @ 16kHz           |
| Database         | PostgreSQL on Supabase                 |
| Auth             | Supabase Auth                          |

## Model usage

One model — **Gemini 2.5 Flash** — used in three roles:

1. **Audio Classifier** (multimodal) — raw WAV audio + text prompt, classifies SIREN / SPEECH / AMBIENT
2. **SirenAgent** (ADK LlmAgent) — confirms emergency, assesses risk, returns action guidance
3. **SpeechSummaryAgent** (ADK LlmAgent) — categorizes transit/PA announcement, returns action for user

## Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Google AI Studio API key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey))
- Supabase project (for auth + database)

### 1. Clone and install frontend

```bash
git clone https://github.com/your-org/indigo-ai-agent.git
cd indigo-ai-agent
npm install
```

### 2. Set up environment variables

Copy the example and fill in your keys:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
GEMINI_API_KEY="your-google-ai-studio-key"
```

### 3. Set up the Python backend

```bash
cd backend/adk_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/adk_service/.env`:

```
ADK_GEMINI_API_KEY="your-google-ai-studio-key"
GEMINI_API_KEY="your-google-ai-studio-key"
ADK_AGENT_MODEL="gemini-2.5-flash"
ADK_APP_NAME="myindigo"
CONFIDENCE_THRESHOLD="0.5"
```

### 4. Run both servers

**Terminal 1 — Backend (port 8001):**

```bash
cd backend/adk_service
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 2 — Frontend (port 3000):**

```bash
npm run dev
```

### 5. Open the app

Go to [http://localhost:3000](http://localhost:3000), click **Go live**, and allow microphone access.

- Play a siren sound from your phone to test emergency detection
- Speak a subway announcement ("Next stop Canal Street") to test speech detection

## Project structure

```
indigo-ai-agent/
├── src/
│   ├── app/                    # Next.js pages + API routes
│   ├── components/             # DemoScreen, PhoneMockup, WatchMockup, AgentPanel
│   ├── hooks/                  # useAgentWebSocket, usePcmAudioCapture
│   ├── server/agents/          # Next.js-side agent pipeline (listen, dispatch, architect, executor)
│   └── types/                  # TypeScript type definitions
├── backend/
│   └── adk_service/            # Python FastAPI + Google ADK
│       ├── app/
│       │   ├── main.py         # WebSocket endpoint
│       │   ├── runtime.py      # Audio classification with Gemini
│       │   ├── orchestrator.py # Rule-based dispatch + ADK agent calls
│       │   ├── adk_runner.py   # ADK Runner wrapper
│       │   └── prompts.py      # All AI prompts
│       └── agents/myindigo/    # ADK agent definitions
├── prisma/                     # Database schema
└── docs/                       # Architecture docs
```

## API rate limits

The free tier of Gemini API allows 20 requests/minute. For live demo use, enable billing on your Google Cloud project to get 2000 RPM. Hackathon usage typically costs under $1.

## Team

Built at NYC Build With AI Hackathon @ NYU Tandon, March 2026.
