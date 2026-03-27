import type { AudioObservation, ListenAdapterInput, SignalLabel } from "@/types/live-agent";

const KEYWORD_RULES: Array<{ signal: SignalLabel; keywords: string[] }> = [
  {
    signal: "fire_alarm",
    keywords: ["fire alarm", "alarm going off", "evacuate immediately"],
  },
  {
    signal: "emergency_vehicle_siren",
    keywords: ["siren", "ambulance", "fire truck", "police car"],
  },
  {
    signal: "crash",
    keywords: ["crash", "collision", "impact", "screech"],
  },
  {
    signal: "hospital_pa",
    keywords: ["exam room", "doctor", "patient", "nurse station"],
  },
  {
    signal: "airport_pa",
    keywords: ["gate", "boarding", "airport", "terminal"],
  },
  {
    signal: "subway_pa",
    keywords: ["train", "platform", "subway", "uptown", "downtown"],
  },
  {
    signal: "name_called",
    keywords: ["please proceed", "now calling", "your name was called"],
  },
  {
    signal: "doorbell",
    keywords: ["doorbell", "someone at the door", "ringing the bell"],
  },
  {
    signal: "baby_crying",
    keywords: ["baby crying", "infant crying", "crying loudly"],
  },
  {
    signal: "conversation",
    keywords: ["conversation", "people talking", "chatting"],
  },
];

function inferSignalFromTranscript(transcript: string): SignalLabel {
  const normalized = transcript.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.signal;
    }
  }

  if (normalized.trim().length === 0) {
    return "unknown";
  }

  return "ambient_noise";
}

export function adaptListenInput(input: ListenAdapterInput): AudioObservation {
  const detectedSignal =
    input.hintSignal && input.hintSignal !== "unknown"
      ? input.hintSignal
      : inferSignalFromTranscript(input.transcript);

  return {
    transcript: input.transcript,
    detectedSignal,
    confidence: input.confidenceHint ?? 0.9,
    timestampIso: input.capturedAtIso ?? new Date().toISOString(),
    source: input.source,
  };
}
