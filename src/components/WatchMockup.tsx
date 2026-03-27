"use client";

import type { AlertEvent } from "./DemoScreen";

type WatchMockupProps = {
  alert: AlertEvent | null;
};

export default function WatchMockup({ alert }: WatchMockupProps) {
  const isSiren = alert?.scenario === "siren";

  return (
    <div style={styles.frame}>
      <div style={styles.crown} />
      <div
        style={{
          ...styles.screen,
          ...(alert
            ? {
                background: isSiren ? "#1a0808" : "#110f1f",
                borderColor: isSiren ? "#E24B4A" : "#7F77DD",
                animation: "watchPop 0.3s ease-out, watchShake 0.4s 0.3s ease",
              }
            : {}),
        }}
      >
        <style>{`
          @keyframes watchPop {
            0% { transform: scale(0.9); }
            60% { transform: scale(1.05); }
            100% { transform: scale(1); }
          }
          @keyframes watchShake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-3px); }
            40% { transform: translateX(3px); }
            60% { transform: translateX(-2px); }
            80% { transform: translateX(2px); }
          }
        `}</style>
        {alert ? (
          <div style={styles.alertContent}>
            <div
              style={{
                ...styles.alertIcon,
                background: isSiren ? "#E24B4A" : "#7F77DD",
              }}
            >
              {isSiren ? "!" : "+"}
            </div>
            <div style={styles.alertTitle}>{alert.title}</div>
            <div style={styles.alertSubtitle}>{alert.subtitle}</div>
          </div>
        ) : (
          <div style={styles.idle}>9:41</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  frame: {
    width: 140,
    height: 180,
    borderRadius: 32,
    border: "2px solid #2a2a2a",
    background: "#000",
    padding: 8,
    position: "relative",
    flexShrink: 0,
  },
  crown: {
    position: "absolute",
    right: -6,
    top: "40%",
    width: 4,
    height: 20,
    borderRadius: 2,
    background: "#2a2a2a",
  },
  screen: {
    width: "100%",
    height: 160,
    borderRadius: 24,
    background: "#111",
    border: "1px solid #222",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    transition: "background 0.3s, border-color 0.3s",
  },
  idle: {
    color: "#555",
    fontSize: 28,
    fontWeight: 300,
    fontVariantNumeric: "tabular-nums",
  },
  alertContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "12px 10px",
    textAlign: "center",
  },
  alertIcon: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
  },
  alertTitle: {
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  alertSubtitle: {
    color: "#ccc",
    fontSize: 9,
    lineHeight: 1.3,
  },
};
