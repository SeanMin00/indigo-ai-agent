"use client";

import { useRef, useEffect } from "react";

export type AgentStepStatus = "inactive" | "active" | "done";

export type AgentStep = {
  id: string;
  label: string;
  sub: string;
  icon: string;
  status: AgentStepStatus;
};

export type ThoughtEntry = {
  id: number;
  timestamp: number;
  agent: string;
  text: string;
  kind: "thinking" | "result" | "alert";
};

type AgentPanelProps = {
  steps: AgentStep[];
  elapsed: number;
  thoughts?: ThoughtEntry[];
};

const AGENT_COLORS: Record<string, string> = {
  dispatch: "#7F77DD",
  vehicle: "#E24B4A",
  name: "#CC8844",
  system: "#555",
};

export default function AgentPanel({
  steps,
  elapsed,
  thoughts = [],
}: AgentPanelProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thoughts.length]);

  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>Agent reasoning chain</div>
      {steps.map((step, i) => {
        const cls = step.status;
        return (
          <div
            key={`${step.id}-${i}`}
            style={{
              ...styles.step,
              opacity: cls === "inactive" ? 0.25 : cls === "done" ? 0.7 : 1,
            }}
          >
            <div
              style={{
                ...styles.stepIcon,
                ...(cls === "active"
                  ? {
                      background: "#16142a",
                      borderColor: "#7F77DD",
                      color: "#CECBF6",
                    }
                  : cls === "done"
                    ? {
                        background: "#0a1710",
                        borderColor: "#1D9E75",
                        color: "#9FE1CB",
                      }
                    : {}),
              }}
            >
              {cls === "done" ? (
                <span style={{ fontSize: 13 }}>✓</span>
              ) : cls === "active" ? (
                <span style={styles.spin} />
              ) : (
                step.icon
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  ...styles.stepLabel,
                  color:
                    cls === "active"
                      ? "#fff"
                      : cls === "done"
                        ? "#9FE1CB"
                        : "#444",
                }}
              >
                {step.label}
              </div>
              {step.sub && (
                <div
                  style={{
                    ...styles.stepSub,
                    color: cls === "active" || cls === "done" ? "#666" : "#333",
                  }}
                >
                  {step.sub}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div style={styles.timerBar}>
        <div style={styles.timerLabel}>Time: sound → alert</div>
        <div style={styles.timerVal}>
          {elapsed > 0 ? `${(elapsed / 1000).toFixed(1)}s` : "—"}
        </div>
      </div>
      {/* Live agent thought log */}
      {thoughts.length > 0 && (
        <div style={styles.thoughtSection}>
          <div style={styles.thoughtTitle}>Live agent log</div>
          <div style={styles.thoughtScroll}>
            {thoughts.map((t) => (
              <div key={t.id} style={styles.thoughtRow}>
                <span
                  style={{
                    ...styles.thoughtAgent,
                    color: AGENT_COLORS[t.agent] ?? "#666",
                  }}
                >
                  {t.agent}
                </span>
                <span
                  style={{
                    ...styles.thoughtText,
                    color:
                      t.kind === "alert"
                        ? "#E24B4A"
                        : t.kind === "result"
                          ? "#9FE1CB"
                          : "#888",
                  }}
                >
                  {t.text}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: "#141414",
    borderWidth: "0.5px",
    borderStyle: "solid",
    borderColor: "#222",
    borderRadius: 14,
    padding: 24,
    minWidth: 0,
    width: "100%",
  },
  panelTitle: {
    fontSize: 12,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 20,
    fontWeight: 600,
  },
  step: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 16,
    transition: "all 0.4s",
  },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: "#1a1a1a",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#2a2a2a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    color: "#555",
    flexShrink: 0,
    transition: "all 0.3s",
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: "#444",
    transition: "color 0.3s",
    lineHeight: 1.3,
  },
  stepSub: {
    fontSize: 12,
    color: "#333",
    marginTop: 3,
    lineHeight: 1.4,
    transition: "color 0.3s",
  },
  spin: {
    width: 10,
    height: 10,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#333",
    borderTopColor: "#7F77DD",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.6s linear infinite",
  },
  timerBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 8,
    borderTop: "0.5px solid #1a1a1a",
  },
  timerLabel: {
    fontSize: 12,
    color: "#444",
  },
  timerVal: {
    fontSize: 14,
    fontWeight: 500,
    color: "#9FE1CB",
    fontVariantNumeric: "tabular-nums",
  },
  thoughtSection: {
    marginTop: 12,
    borderTop: "0.5px solid #1a1a1a",
    paddingTop: 12,
  },
  thoughtTitle: {
    fontSize: 11,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: 600,
  },
  thoughtScroll: {
    maxHeight: 180,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  thoughtRow: {
    display: "flex",
    gap: 8,
    fontSize: 12,
    lineHeight: 1.5,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  thoughtAgent: {
    fontWeight: 600,
    minWidth: 70,
    flexShrink: 0,
  },
  thoughtText: {
    color: "#888",
  },
};
