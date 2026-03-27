import type {
  AudioObservation,
  DispatchDecision,
  SignalCategory,
  SignalLabel,
} from "@/types/live-agent";

const EMERGENCY_SIGNALS: SignalLabel[] = [
  "fire_alarm",
  "emergency_vehicle_siren",
];

const INFO_SIGNALS: SignalLabel[] = [
  "hospital_pa",
  "airport_pa",
  "name_called",
  "doorbell",
];

const ROUTINE_SIGNALS: SignalLabel[] = ["conversation", "ambient_noise"];

function resolveCategory(signal: SignalLabel): SignalCategory {
  if (EMERGENCY_SIGNALS.includes(signal)) return "emergency";
  if (INFO_SIGNALS.includes(signal)) return "info";
  if (ROUTINE_SIGNALS.includes(signal)) return "routine";
  return "unknown";
}

function buildReasoning(
  signal: SignalLabel,
  category: SignalCategory,
  transcript: string,
): string {
  return `Signal "${signal}" classified as "${category}" from transcript: "${transcript}"`;
}

export function dispatchAudioObservation(
  observation: AudioObservation,
): DispatchDecision {
  const category = resolveCategory(observation.detectedSignal);

  return {
    category,
    signal: observation.detectedSignal,
    confidence: observation.confidence,
    routeTo: "architect",
    reasoning: buildReasoning(
      observation.detectedSignal,
      category,
      observation.transcript,
    ),
  };
}
