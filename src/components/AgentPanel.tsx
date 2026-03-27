"use client";

export type AgentStepStatus = "inactive" | "active" | "done";

export type AgentStep = {
  id: string;
  label: string;
  icon: string;
  status: AgentStepStatus;
  output: string;
};

type AgentPanelProps = {
  steps: AgentStep[];
  elapsed: number;
};

export default function AgentPanel({ steps, elapsed }: AgentPanelProps) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>Agent reasoning</div>
      <div style={styles.stepList}>
        {steps.map((step) => (
          <div
            key={step.id}
            style={{
              ...styles.stepRow,
              opacity: step.status === "inactive" ? 0.2 : 1,
            }}
          >
            <div
              style={{
                ...styles.iconCircle,
                borderColor:
                  step.status === "active"
                    ? "#7F77DD"
                    : step.status === "done"
                      ? "#1D9E75"
                      : "#444",
                background:
                  step.status === "active"
                    ? "rgba(127,119,221,0.15)"
                    : step.status === "done"
                      ? "rgba(29,158,117,0.15)"
                      : "transparent",
              }}
            >
              {step.status === "done" ? (
                <span style={{ color: "#1D9E75", fontSize: 14 }}>✓</span>
              ) : step.status === "active" ? (
                <span style={styles.spinner} />
              ) : (
                <span style={{ color: "#666", fontSize: 12, fontWeight: 700 }}>
                  {step.icon}
                </span>
              )}
            </div>
            <div style={styles.stepContent}>
              <div style={styles.stepLabel}>{step.label}</div>
              {step.output && (
                <div style={styles.stepOutput}>{step.output}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={styles.timer}>{(elapsed / 1000).toFixed(1)}s elapsed</div>
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
    flex: 1,
    minWidth: 280,
    maxWidth: 400,
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 16,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: "#666",
  },
  stepList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    flex: 1,
  },
  stepRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    transition: "opacity 0.3s",
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "border-color 0.3s, background 0.3s",
  },
  spinner: {
    width: 12,
    height: 12,
    border: "2px solid transparent",
    borderTopColor: "#7F77DD",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
  },
  stepContent: {
    flex: 1,
    minWidth: 0,
  },
  stepLabel: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: 600,
  },
  stepOutput: {
    color: "#ccc",
    fontSize: 11,
    marginTop: 4,
    lineHeight: 1.4,
  },
  timer: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
};
