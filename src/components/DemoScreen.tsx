"use client";

import { useState, useRef } from "react";
import PhoneMockup from "./PhoneMockup";
import AgentPanel from "./AgentPanel";
import WatchMockup from "./WatchMockup";
import type { AgentStep } from "./AgentPanel";

export type AlertEvent = {
  scenario: "siren" | "name";
  title: string;
  subtitle: string;
  risk: string;
};

type DemoEvent =
  | { type: "soundDetected"; text: string; latency_ms: number }
  | {
      type: "agentStep";
      agent: string;
      status: "active" | "done";
      output: string;
    }
  | {
      type: "alert";
      scenario: "siren" | "name";
      title: string;
      subtitle: string;
      risk: string;
    };

type ScheduledEvent = { delay: number; event: DemoEvent };

const SIREN_SEQUENCE: ScheduledEvent[] = [
  {
    delay: 700,
    event: {
      type: "soundDetected",
      text: "Siren detected",
      latency_ms: 620,
    },
  },
  {
    delay: 1400,
    event: {
      type: "agentStep",
      agent: "dispatch",
      status: "active",
      output: "Emergency siren — routing to VehicleSoundAgent",
    },
  },
  {
    delay: 2000,
    event: {
      type: "agentStep",
      agent: "dispatch",
      status: "done",
      output: "Siren confirmed — high confidence",
    },
  },
  {
    delay: 2600,
    event: {
      type: "agentStep",
      agent: "vehicle",
      status: "active",
      output: "Classifying: fire engine approaching from behind",
    },
  },
  {
    delay: 3200,
    event: {
      type: "agentStep",
      agent: "vehicle",
      status: "done",
      output: "Risk: HIGH — immediate action required",
    },
  },
  {
    delay: 3500,
    event: {
      type: "alert",
      scenario: "siren",
      title: "Fire truck approaching",
      subtitle: "Move to sidewalk now",
      risk: "HIGH",
    },
  },
];

const NAME_SEQUENCE: ScheduledEvent[] = [
  {
    delay: 900,
    event: {
      type: "soundDetected",
      text: "Announcement detected",
      latency_ms: 810,
    },
  },
  {
    delay: 1600,
    event: {
      type: "agentStep",
      agent: "dispatch",
      status: "active",
      output: "Speech detected — scanning for registered name",
    },
  },
  {
    delay: 2300,
    event: {
      type: "agentStep",
      agent: "dispatch",
      status: "done",
      output: "Name match found: Alex Kim",
    },
  },
  {
    delay: 2900,
    event: {
      type: "agentStep",
      agent: "name",
      status: "active",
      output: "Extracting location from announcement",
    },
  },
  {
    delay: 3500,
    event: {
      type: "agentStep",
      agent: "name",
      status: "done",
      output: "Exam Room 3, 2nd floor confirmed",
    },
  },
  {
    delay: 3800,
    event: {
      type: "alert",
      scenario: "name",
      title: "Your name was called",
      subtitle: "Go to Exam Room 3",
      risk: "MEDIUM",
    },
  },
];

function getInitialSteps(scenario: "siren" | "name"): AgentStep[] {
  return [
    {
      id: "dispatch-active",
      label: "DispatchAgent",
      icon: "D",
      status: "inactive",
      output: "",
    },
    {
      id: "dispatch-done",
      label: "DispatchAgent",
      icon: "D",
      status: "inactive",
      output: "",
    },
    {
      id: scenario === "siren" ? "vehicle" : "name",
      label: scenario === "siren" ? "VehicleSoundAgent" : "NameDetectionAgent",
      icon: scenario === "siren" ? "V" : "N",
      status: "inactive",
      output: "",
    },
    {
      id: "alert",
      label: "Alert dispatched",
      icon: "A",
      status: "inactive",
      output: "",
    },
  ];
}

function mapAgentToStepIndex(agent: string, status: "active" | "done"): number {
  if (agent === "dispatch" && status === "active") return 0;
  if (agent === "dispatch" && status === "done") return 1;
  if (agent === "vehicle" || agent === "name") return 2;
  return -1;
}

type DemoScreenProps = {
  userName: string;
  onLogout: () => void;
};

export default function DemoScreen({ userName, onLogout }: DemoScreenProps) {
  const [scenario, setScenario] = useState<"siren" | "name">("siren");
  const [demoMode, setDemoMode] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [alert, setAlert] = useState<AlertEvent | null>(null);
  const [radarActive, setRadarActive] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>(getInitialSteps("siren"));
  const [elapsed, setElapsed] = useState(0);
  const [soundText, setSoundText] = useState("");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  function reset(s: "siren" | "name") {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPlaying(false);
    setAlert(null);
    setRadarActive(false);
    setSoundText("");
    setElapsed(0);
    setSteps(getInitialSteps(s));
  }

  function switchScenario(s: "siren" | "name") {
    setScenario(s);
    reset(s);
  }

  function handleEvent(event: DemoEvent) {
    if (event.type === "soundDetected") {
      setSoundText(event.text);
      setRadarActive(true);
    } else if (event.type === "agentStep") {
      const idx = mapAgentToStepIndex(event.agent, event.status);
      if (idx >= 0) {
        setSteps((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            status: event.status,
            output: event.output,
          };
          return next;
        });
      }
    } else if (event.type === "alert") {
      setAlert({
        scenario: event.scenario,
        title: event.title,
        subtitle: event.subtitle,
        risk: event.risk,
      });
      setSteps((prev) => {
        const next = [...prev];
        next[3] = {
          ...next[3],
          status: "done",
          output: `${event.title} — ${event.risk}`,
        };
        return next;
      });
    }
  }

  function playDemo() {
    reset(scenario);
    setPlaying(true);
    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 100);

    const sequence = scenario === "siren" ? SIREN_SEQUENCE : NAME_SEQUENCE;

    const newTimers = sequence.map(({ delay, event }) =>
      setTimeout(() => handleEvent(event), delay),
    );

    const lastDelay = sequence[sequence.length - 1].delay;
    newTimers.push(
      setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setElapsed(lastDelay);
      }, lastDelay + 100),
    );

    timersRef.current = newTimers;
  }

  return (
    <div style={styles.root}>
      <header style={styles.topBar}>
        <div style={styles.logo}>myIndigo</div>
        <div style={styles.scenarioToggle}>
          <button
            onClick={() => switchScenario("siren")}
            style={{
              ...styles.scenarioBtn,
              background:
                scenario === "siren" ? "rgba(226,75,74,0.15)" : "transparent",
              color: scenario === "siren" ? "#E24B4A" : "#666",
              borderColor: scenario === "siren" ? "#E24B4A" : "#333",
            }}
          >
            🚨 Siren
          </button>
          <button
            onClick={() => switchScenario("name")}
            style={{
              ...styles.scenarioBtn,
              background:
                scenario === "name" ? "rgba(127,119,221,0.15)" : "transparent",
              color: scenario === "name" ? "#7F77DD" : "#666",
              borderColor: scenario === "name" ? "#7F77DD" : "#333",
            }}
          >
            📢 Name
          </button>
        </div>
        <div style={styles.statusPill}>
          <span style={styles.statusDot} />
          Always listening
        </div>
        <div style={styles.userInfo}>
          <span style={styles.userName}>{userName}</span>
          <button onClick={onLogout} style={styles.logoutBtn}>
            Log out
          </button>
        </div>
      </header>

      <main style={styles.columns}>
        <PhoneMockup
          alert={alert}
          scenario={scenario}
          radarActive={radarActive}
        />
        <AgentPanel steps={steps} elapsed={elapsed} />
        <WatchMockup alert={alert} />
      </main>

      {soundText && <div style={styles.soundBanner}>🎤 {soundText}</div>}

      <footer style={styles.footer}>
        <label style={styles.demoToggle}>
          <span style={{ color: "#888", fontSize: 13 }}>Demo mode</span>
          <button
            onClick={() => setDemoMode(!demoMode)}
            style={{
              ...styles.toggleTrack,
              background: demoMode ? "#7F77DD" : "#333",
            }}
          >
            <span
              style={{
                ...styles.toggleThumb,
                transform: demoMode ? "translateX(18px)" : "translateX(2px)",
              }}
            />
          </button>
        </label>

        {demoMode ? (
          <button
            onClick={playDemo}
            disabled={playing}
            style={{
              ...styles.playBtn,
              opacity: playing ? 0.5 : 1,
            }}
          >
            {playing ? "Playing..." : "Play demo"}
          </button>
        ) : (
          <div style={styles.micStatus}>🎙 Mic active (placeholder)</div>
        )}

        <div style={styles.elapsedTimer}>{(elapsed / 1000).toFixed(1)}s</div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 24px",
    borderBottom: "1px solid #222",
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    color: "#7F77DD",
  },
  scenarioToggle: {
    display: "flex",
    gap: 8,
    marginLeft: 24,
  },
  scenarioBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  statusPill: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 999,
    background: "rgba(29,158,117,0.12)",
    color: "#1D9E75",
    fontSize: 12,
    fontWeight: 500,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#1D9E75",
    display: "inline-block",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginLeft: 16,
  },
  userName: {
    color: "#888",
    fontSize: 13,
  },
  logoutBtn: {
    background: "none",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#888",
    fontSize: 12,
    padding: "4px 10px",
    cursor: "pointer",
  },
  columns: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
    padding: "40px 24px",
  },
  soundBanner: {
    textAlign: "center",
    padding: "8px 0",
    color: "#7F77DD",
    fontSize: 13,
    fontWeight: 500,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    padding: "16px 24px",
    borderTop: "1px solid #222",
  },
  demoToggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  toggleTrack: {
    width: 38,
    height: 20,
    borderRadius: 10,
    border: "none",
    position: "relative",
    cursor: "pointer",
    transition: "background 0.2s",
    padding: 0,
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#fff",
    display: "block",
    transition: "transform 0.2s",
  },
  playBtn: {
    padding: "8px 24px",
    borderRadius: 8,
    border: "none",
    background: "#7F77DD",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  micStatus: {
    color: "#1D9E75",
    fontSize: 13,
  },
  elapsedTimer: {
    color: "#555",
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
    minWidth: 50,
    textAlign: "right",
  },
};
