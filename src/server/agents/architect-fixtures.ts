import type { ContextSnapshot, DispatchDecision } from "@/types/live-agent";

export const emergencyDispatchFixture: DispatchDecision = {
  category: "emergency",
  signal: "emergency_vehicle_siren",
  confidence: 0.96,
  routeTo: "architect",
  reasoning: "Signal classified as emergency from siren-like waveform.",
};

export const infoDispatchFixture: DispatchDecision = {
  category: "info",
  signal: "hospital_pa",
  confidence: 0.91,
  routeTo: "architect",
  reasoning:
    "Signal classified as info from public announcement voice pattern.",
};

export const awarenessDispatchFixture: DispatchDecision = {
  category: "routine",
  signal: "doorbell",
  confidence: 0.89,
  routeTo: "architect",
  reasoning: "Signal classified as routine home awareness event.",
};

export const emergencyContextFixture: ContextSnapshot = {
  locationLabel: "main intersection",
  environmentLabel: "street",
  userSituation: "on_foot",
};

export const infoContextFixture: ContextSnapshot = {
  locationLabel: "outpatient desk",
  environmentLabel: "hospital lobby",
  userSituation: "waiting_room",
};

export const awarenessContextFixture: ContextSnapshot = {
  locationLabel: "home entryway",
  environmentLabel: "apartment",
  userSituation: "indoors",
};
