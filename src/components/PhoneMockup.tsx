"use client";

import type { AlertEvent } from "./DemoScreen";

type PhoneMockupProps = {
  alert: AlertEvent | null;
  scenario: "siren" | "name";
  radarActive: boolean;
};

export default function PhoneMockup({
  alert,
  scenario,
  radarActive,
}: PhoneMockupProps) {
  const isSiren = alert?.scenario === "siren";
  const isName = alert?.scenario === "name";

  return (
    <div style={styles.frame}>
      <div style={styles.notch} />
      <div style={styles.screen}>
        <div style={styles.locationPill}>Chelsea, NY 10011</div>

        <div style={styles.radarContainer}>
          <div
            style={{
              ...styles.radarRing,
              width: 140,
              height: 140,
              opacity: 0.15,
            }}
          />
          <div
            style={{
              ...styles.radarRing,
              width: 100,
              height: 100,
              opacity: 0.25,
            }}
          />
          <div
            style={{
              ...styles.radarRing,
              width: 60,
              height: 60,
              opacity: 0.35,
            }}
          />
          <div style={styles.centerDot} />

          {radarActive && scenario === "siren" && (
            <div style={styles.sirenDot}>
              <style>{`
                @keyframes sirenPulse {
                  0%, 100% { transform: scale(1); opacity: 1; }
                  50% { transform: scale(1.6); opacity: 0.5; }
                }
              `}</style>
            </div>
          )}
        </div>

        {alert && (
          <div
            style={{
              ...styles.alertPanel,
              background: isSiren ? "#1a0808" : "#110f1f",
              borderColor: isSiren ? "#E24B4A" : "#7F77DD",
            }}
          >
            <style>{`
              @keyframes slideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>
            <div
              style={{
                ...styles.alertIcon,
                background: isSiren ? "#E24B4A" : "#7F77DD",
              }}
            >
              {isSiren ? "!" : "+"}
            </div>
            <div>
              <div style={styles.alertTitle}>{alert.title}</div>
              <div style={styles.alertSubtitle}>{alert.subtitle}</div>
            </div>
            {alert.risk && (
              <div
                style={{
                  ...styles.riskBadge,
                  background:
                    alert.risk === "HIGH"
                      ? "rgba(226,75,74,0.2)"
                      : "rgba(127,119,221,0.2)",
                  color: isName ? "#7F77DD" : "#E24B4A",
                }}
              >
                {alert.risk}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  frame: {
    width: 220,
    height: 440,
    borderRadius: 44,
    border: "2px solid #2a2a2a",
    background: "#000",
    padding: 8,
    position: "relative",
    flexShrink: 0,
  },
  notch: {
    width: 80,
    height: 24,
    background: "#000",
    borderRadius: "0 0 16px 16px",
    position: "absolute",
    top: 8,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2,
  },
  screen: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
    background: "#1a1a2e",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  locationPill: {
    marginTop: 36,
    padding: "4px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    color: "#aaa",
    fontSize: 10,
    fontWeight: 500,
  },
  radarContainer: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    width: "100%",
  },
  radarRing: {
    position: "absolute",
    borderRadius: "50%",
    border: "1px solid #7F77DD",
  },
  centerDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#fff",
    position: "absolute",
    zIndex: 1,
  },
  sirenDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#E24B4A",
    position: "absolute",
    top: "25%",
    right: "25%",
    zIndex: 1,
    animation: "sirenPulse 1s ease-in-out infinite",
  },
  alertPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "12px 14px",
    borderTop: "1px solid",
    display: "flex",
    alignItems: "center",
    gap: 10,
    animation: "slideUp 0.3s ease-out",
  },
  alertIcon: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },
  alertTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  alertSubtitle: {
    color: "#ccc",
    fontSize: 10,
    lineHeight: 1.3,
    marginTop: 2,
  },
  riskBadge: {
    marginLeft: "auto",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    flexShrink: 0,
  },
};
