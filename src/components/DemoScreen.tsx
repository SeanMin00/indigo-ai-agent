"use client";

import { useState, useRef, useCallback } from "react";
import PhoneMockup from "./PhoneMockup";
import AgentPanel from "./AgentPanel";
import WatchMockup from "./WatchMockup";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import {
  useAgentWebSocket,
  type ServerMessage,
} from "@/hooks/useAgentWebSocket";
import type { AgentStep, ThoughtEntry } from "./AgentPanel";

export type AlertEvent = {
  scenario: "siren" | "hospital";
  title: string;
  subtitle: string;
  risk: string;
};

/* ── Initial step definitions ───────────────────────────── */

const INITIAL_STEPS: AgentStep[] = [
  {
    id: "dispatch-listen",
    label: "DispatchAgent listening",
    sub: "Gemini Live — always on",
    icon: "D",
    status: "inactive",
  },
  {
    id: "dispatch-classify",
    label: "Sound classified",
    sub: "",
    icon: "D",
    status: "inactive",
  },
  {
    id: "specialist",
    label: "Specialist agent called",
    sub: "",
    icon: "S",
    status: "inactive",
  },
  {
    id: "risk",
    label: "Risk scored + alert generated",
    sub: "",
    icon: "S",
    status: "inactive",
  },
  {
    id: "alert",
    label: "Alert dispatched to devices",
    sub: "",
    icon: "A",
    status: "inactive",
  },
];

/* ── Demo simulation data (used when backend not connected) */

type SimStep = { delay: number; msg: ServerMessage };

const SIREN_SIM: SimStep[] = [
  {
    delay: 600,
    msg: { type: "sound_detected", text: "Siren detected", latency_ms: 620 },
  },
  {
    delay: 1100,
    msg: {
      type: "agent_update",
      agent: "dispatch",
      status: "active",
      output:
        "Analyzing audio spectrum... frequency pattern matches emergency siren",
    },
  },
  {
    delay: 1800,
    msg: {
      type: "agent_update",
      agent: "dispatch",
      status: "active",
      output:
        "Classification: emergency vehicle siren — delegating to VehicleSoundAgent",
    },
  },
  {
    delay: 2300,
    msg: {
      type: "agent_update",
      agent: "dispatch",
      status: "done",
      output: "Siren confirmed — high confidence (0.96)",
    },
  },
  {
    delay: 2500,
    msg: {
      type: "agent_update",
      agent: "vehicle",
      status: "active",
      output: "Identifying vehicle type from harmonic signature...",
    },
  },
  {
    delay: 3000,
    msg: {
      type: "agent_update",
      agent: "vehicle",
      status: "active",
      output:
        "Fire engine detected — Doppler shift indicates approach from rear",
    },
  },
  {
    delay: 3500,
    msg: {
      type: "agent_update",
      agent: "vehicle",
      status: "done",
      output: "Risk: HIGH — W 23rd St, pedestrian near intersection",
    },
  },
  {
    delay: 4200,
    msg: {
      type: "alert",
      scenario: "siren",
      title: "Emergency vehicle approaching",
      subtitle: "Check surroundings and yield — W 23rd St",
      risk: "HIGH",
    },
  },
];

const HOSPITAL_SIM: SimStep[] = [
  {
    delay: 600,
    msg: {
      type: "sound_detected",
      text: "PA speech detected",
      latency_ms: 810,
    },
  },
  {
    delay: 1100,
    msg: {
      type: "agent_update",
      agent: "dispatch",
      status: "active",
      output: "Transcribing PA audio... speech-to-text running",
    },
  },
  {
    delay: 1700,
    msg: {
      type: "agent_update",
      agent: "dispatch",
      status: "active",
      output:
        'Transcript: "Alex Kim, please report to Exam Room 3" — scanning for registered name',
    },
  },
  {
    delay: 2300,
    msg: {
      type: "agent_update",
      agent: "dispatch",
      status: "done",
      output:
        "Name match: Alex Kim (registered user) — delegating to NameDetectionAgent",
    },
  },
  {
    delay: 2600,
    msg: {
      type: "agent_update",
      agent: "name",
      status: "active",
      output: "Parsing announcement for location references...",
    },
  },
  {
    delay: 3100,
    msg: {
      type: "agent_update",
      agent: "name",
      status: "active",
      output: 'Location extracted: "Exam Room 3" — resolving floor + wing',
    },
  },
  {
    delay: 3600,
    msg: {
      type: "agent_update",
      agent: "name",
      status: "done",
      output: "Exam Room 3, 2nd floor — wayfinding: north wing",
    },
  },
  {
    delay: 4300,
    msg: {
      type: "alert",
      scenario: "name",
      title: "Your name was called",
      subtitle: "Exam Room 3 — 2nd floor north wing",
      risk: "MEDIUM",
    },
  },
];

/* ── Map WebSocket agent_update to step index ───────────── */

function agentToStepIndex(agent: string, status: "active" | "done"): number {
  if (agent === "dispatch" && status === "active") return 1;
  if (agent === "dispatch" && status === "done") return 1;
  if ((agent === "vehicle" || agent === "name") && status === "active")
    return 2;
  if ((agent === "vehicle" || agent === "name") && status === "done") return 3;
  return -1;
}

/* ── Component ──────────────────────────────────────────── */

type DemoScreenProps = {
  userName: string;
  onLogout: () => void;
};

const WS_URL = "ws://localhost:8001/ws";

export default function DemoScreen({
  userName,
  onLogout: _onLogout,
}: DemoScreenProps) {
  const [sc, setSc] = useState<"siren" | "hospital">("siren");
  const [steps, setSteps] = useState<AgentStep[]>(
    INITIAL_STEPS.map((s) => ({ ...s })),
  );
  const [elapsed, setElapsed] = useState(0);
  const [alert, setAlert] = useState<AlertEvent | null>(null);
  const [radarActive, setRadarActive] = useState(false);
  const [locationText, setLocationText] = useState("Chelsea, NY 10011");
  const [isLive, setIsLive] = useState(false);
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const thoughtIdRef = useRef(0);

  const addThought = useCallback(
    (agent: string, text: string, kind: ThoughtEntry["kind"] = "thinking") => {
      setThoughts((prev) => [
        ...prev,
        {
          id: ++thoughtIdRef.current,
          timestamp: Date.now(),
          agent,
          text,
          kind,
        },
      ]);
    },
    [],
  );

  /* ── Handle any message (from WS or demo sim) ────────── */

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      if (msg.type === "sound_detected") {
        // Step 0: DispatchAgent heard something
        addThought(
          "dispatch",
          `Audio input detected: "${msg.text}" (${msg.latency_ms}ms)`,
        );
        setRadarActive(true);
        startRef.current = Date.now();
        intervalRef.current = setInterval(() => {
          setElapsed(Date.now() - startRef.current);
        }, 100);

        setSteps((prev) => {
          const next = prev.map((s) => ({ ...s }));
          next[0] = {
            ...next[0],
            status: "active",
            label: `Sound detected — ${msg.text}`,
            sub: `Gemini Live: latency ${msg.latency_ms}ms`,
          };
          return next;
        });
      } else if (msg.type === "agent_update") {
        const agentLabel =
          msg.agent === "dispatch"
            ? "dispatch"
            : msg.agent === "vehicle"
              ? "vehicle"
              : "name";
        addThought(
          agentLabel,
          msg.output,
          msg.status === "done" ? "result" : "thinking",
        );
        const idx = agentToStepIndex(msg.agent, msg.status);
        if (idx < 0) return;

        setSteps((prev) => {
          const next = prev.map((s) => ({ ...s }));

          // Mark step 0 done when dispatch starts
          if (idx === 1 && next[0].status === "active") {
            next[0] = { ...next[0], status: "done" };
          }
          // Mark dispatch done when specialist starts
          if (idx === 2 && next[1].status !== "done") {
            next[1] = { ...next[1], status: "done" };
          }
          // Mark specialist active→done when risk scored
          if (idx === 3 && next[2].status === "active") {
            next[2] = { ...next[2], status: "done" };
          }

          next[idx] = {
            ...next[idx],
            status: msg.status,
            label: msg.output.split("—")[0].trim() || next[idx].label,
            sub: msg.output,
          };

          return next;
        });
      } else if (msg.type === "alert") {
        addThought("system", `ALERT: ${msg.title} — ${msg.risk}`, "alert");
        // Stop timer
        if (intervalRef.current) clearInterval(intervalRef.current);
        setElapsed(Date.now() - startRef.current);

        // Mark remaining steps done
        setSteps((prev) => {
          const next = prev.map((s) => ({ ...s }));
          for (let i = 0; i < 4; i++) {
            if (next[i].status !== "done") {
              next[i] = { ...next[i], status: "done" };
            }
          }
          next[4] = {
            ...next[4],
            status: "done",
            label: "Alert dispatched to phone + watch",
            sub: `${msg.title} — ${msg.risk}`,
          };
          return next;
        });

        const scenario = msg.scenario === "name" ? "hospital" : "siren";

        setAlert({
          scenario,
          title: msg.title,
          subtitle: msg.subtitle,
          risk: msg.risk,
        });
      }
    },
    [addThought],
  );

  /* ── WebSocket (real backend) ─────────────────────────── */

  const { connected, connect, disconnect, sendAudioChunk } = useAgentWebSocket({
    url: WS_URL,
    userName,
    userId: "demo-user",
    onMessage: handleMessage,
  });

  /* ── Audio capture ────────────────────────────────────── */

  const {
    capturing,
    micError,
    start: startAudio,
    stop: stopAudio,
  } = useAudioCapture({
    onChunk: sendAudioChunk,
  });

  /* ── Reset ────────────────────────────────────────────── */

  const reset = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(0);
    setAlert(null);
    setRadarActive(false);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setThoughts([]);
    thoughtIdRef.current = 0;
  }, []);

  /* ── Switch scenario ──────────────────────────────────── */

  function switchScenario(s: "siren" | "hospital") {
    setSc(s);
    reset();
    setLocationText(
      s === "siren" ? "Chelsea, NY 10011" : "NYU Langone — Lobby",
    );
  }

  /* ── Go live (connect WS + mic) ───────────────────────── */

  function toggleLive() {
    if (isLive) {
      stopAudio();
      disconnect();
      setIsLive(false);
    } else {
      reset();
      connect();
      startAudio();
      setIsLive(true);
      // Set step 0 to active — listening
      setSteps((prev) => {
        const next = prev.map((s) => ({ ...s }));
        next[0] = { ...next[0], status: "active" };
        return next;
      });
    }
  }

  /* ── Play demo (simulated messages) ───────────────────── */

  async function playDemo() {
    reset();
    setLocationText(
      sc === "siren" ? "Chelsea, NY 10011" : "NYU Langone — Lobby",
    );

    if (sc === "siren") setRadarActive(true);

    if (connected) {
      // Trigger server-side demo — events come back via WebSocket
      const scenario = sc === "siren" ? "siren" : "name";
      try {
        await fetch(`http://localhost:8001/demo/${scenario}`, {
          method: "POST",
        });
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

  /* ── Watch alert mapping ──────────────────────────────── */

  const watchAlert: AlertEvent | null = alert
    ? sc === "siren"
      ? {
          scenario: "siren",
          title: "Fire truck behind you",
          subtitle: "Move right · Engine 14",
          risk: alert.risk,
        }
      : {
          scenario: "hospital",
          title: "Your name was called",
          subtitle: "Exam Room 3 · 2nd floor",
          risk: alert.risk,
        }
    : null;

  /* ── Render ───────────────────────────────────────────── */

  return (
    <div style={styles.stage}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.logo}>
          my<b>Indigo</b>
        </div>
        <div style={styles.scRow}>
          <button
            style={{
              ...styles.scBtn,
              ...(sc === "siren" ? styles.scBtnOn : {}),
            }}
            onClick={() => switchScenario("siren")}
          >
            Emergency vehicle
          </button>
          <button
            style={{
              ...styles.scBtn,
              ...(sc === "hospital" ? styles.scBtnOn : {}),
            }}
            onClick={() => switchScenario("hospital")}
          >
            Hospital PA
          </button>
        </div>
        <div
          style={{
            ...styles.livePill,
            ...(connected
              ? {}
              : {
                  background: "#1a1008",
                  borderColor: "#886622",
                  color: "#cc9944",
                }),
          }}
        >
          <span
            style={{
              ...styles.liveDot,
              background: connected ? "#1D9E75" : "#886622",
            }}
          />
          {micError
            ? "Mic denied — demo mode"
            : connected
              ? capturing
                ? "Listening..."
                : "Connected"
              : "Offline — demo mode"}
        </div>
      </div>

      {/* Main layout: devices left, agent panel right */}
      <div style={styles.mainCols}>
        <div style={styles.devicesCol}>
          <div style={styles.deviceWrap}>
            <PhoneMockup
              alert={alert}
              scenario={sc}
              radarActive={radarActive}
              locationText={locationText}
            />
            <div style={styles.labelTag}>iPhone</div>
          </div>
          <div style={styles.deviceWrap}>
            <WatchMockup alert={watchAlert} />
            <div style={styles.labelTag}>Apple Watch</div>
          </div>
        </div>
        <div style={styles.panelWrap}>
          <AgentPanel steps={steps} elapsed={elapsed} thoughts={thoughts} />
          <div style={styles.labelTag}>Agent reasoning — ADK pipeline</div>
        </div>
      </div>

      {/* Controls */}
      <div style={styles.btnRow}>
        <button
          style={{
            ...styles.liveBtn,
            ...(isLive
              ? {
                  background: "#1a0808",
                  borderColor: "#E24B4A",
                  color: "#ff6b6b",
                }
              : {}),
          }}
          onClick={toggleLive}
        >
          {isLive ? "⏹ Stop listening" : "🎙 Go live"}
        </button>
        <button style={styles.playBtn} onClick={playDemo}>
          ▶ Play demo
        </button>
        <button style={styles.resetBtn} onClick={reset}>
          Reset
        </button>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  stage: {
    background: "#0a0a0a",
    minHeight: "100vh",
    padding: "28px 48px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
    boxSizing: "border-box",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    color: "#fff",
    fontSize: 20,
    fontWeight: 500,
    letterSpacing: -0.3,
  },
  scRow: {
    display: "flex",
    gap: 6,
  },
  scBtn: {
    background: "transparent",
    borderWidth: "0.5px",
    borderStyle: "solid",
    borderColor: "#2a2a2a",
    color: "#555",
    borderRadius: 20,
    padding: "6px 18px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
  },
  scBtnOn: {
    borderColor: "#7F77DD",
    color: "#CECBF6",
    background: "#16142a",
  },
  livePill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#0f2218",
    borderWidth: "0.5px",
    borderStyle: "solid",
    borderColor: "#1D9E75",
    borderRadius: 20,
    padding: "6px 16px",
    fontSize: 13,
    color: "#9FE1CB",
    transition: "all 0.3s",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#1D9E75",
    display: "inline-block",
    animation: "blink 1.3s infinite",
  },
  mainCols: {
    flex: 1,
    display: "flex",
    gap: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  devicesCol: {
    display: "flex",
    gap: 32,
    alignItems: "center",
  },
  deviceWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  },
  panelWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
    justifyContent: "center",
  },
  labelTag: {
    fontSize: 11,
    color: "#444",
    textAlign: "center",
  },
  btnRow: {
    display: "flex",
    gap: 8,
  },
  liveBtn: {
    background: "#0f2218",
    borderWidth: "0.5px",
    borderStyle: "solid",
    borderColor: "#1D9E75",
    color: "#9FE1CB",
    borderRadius: 8,
    padding: "9px 22px",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
  },
  playBtn: {
    background: "#16142a",
    borderWidth: "0.5px",
    borderStyle: "solid",
    borderColor: "#7F77DD",
    color: "#CECBF6",
    borderRadius: 8,
    padding: "9px 22px",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  resetBtn: {
    background: "transparent",
    borderWidth: "0.5px",
    borderStyle: "solid",
    borderColor: "#2a2a2a",
    color: "#555",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
