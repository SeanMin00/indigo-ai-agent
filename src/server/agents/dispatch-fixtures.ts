import type { AudioObservation } from "@/types/live-agent";

export const emergencyVehicleFixture: AudioObservation = {
  transcript: "Loud siren approaching from behind",
  detectedSignal: "emergency_vehicle_siren",
  confidence: 0.96,
  timestampIso: new Date().toISOString(),
  source: "simulation",
};

export const hospitalPaFixture: AudioObservation = {
  transcript: "Alex Kim, please proceed to Exam Room 3.",
  detectedSignal: "hospital_pa",
  confidence: 0.91,
  timestampIso: new Date().toISOString(),
  source: "simulation",
};
