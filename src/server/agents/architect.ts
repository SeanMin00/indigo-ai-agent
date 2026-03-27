import type {
  ArchitectDecision,
  ContextSnapshot,
  DispatchDecision,
} from "@/types/live-agent";

function buildEmergencyDecision(
  decision: DispatchDecision,
  context: ContextSnapshot,
): ArchitectDecision {
  const locationHint = context.locationLabel
    ? ` near ${context.locationLabel}`
    : "";

  return {
    mode: "emergency",
    severity: decision.signal === "fire_alarm" ? "critical" : "high",
    title:
      decision.signal === "fire_alarm"
        ? "Fire alarm detected"
        : "Emergency vehicle approaching",
    userMessage:
      decision.signal === "fire_alarm"
        ? `Fire alarm detected${locationHint}. Leave the area and check for safety.`
        : `Emergency vehicle approaching${locationHint}. Move right and stay alert.`,
    recommendedActions:
      decision.signal === "fire_alarm"
        ? ["Leave the building", "Check exits", "Avoid elevators"]
        : ["Move right", "Check surroundings", "Yield immediately"],
    wearableSignal: "strong-vibration",
    escalation: "notify-now",
  };
}

function buildInfoDecision(
  _decision: DispatchDecision,
  context: ContextSnapshot,
): ArchitectDecision {
  const environmentHint = context.environmentLabel
    ? ` in ${context.environmentLabel}`
    : "";

  return {
    mode: "info",
    severity: "medium",
    title: "Important announcement",
    userMessage: `Important announcement detected${environmentHint}. Check the summary and directions.`,
    recommendedActions: [
      "Read summary",
      "Confirm location",
      "Follow directions",
    ],
    wearableSignal: "standard-vibration",
    escalation: "surface-now",
  };
}

function buildRoutineDecision(): ArchitectDecision {
  return {
    mode: "awareness",
    severity: "low",
    title: "Routine sound",
    userMessage: "Routine environmental sound detected.",
    recommendedActions: ["No immediate action needed"],
    wearableSignal: "visual-only",
    escalation: "log-only",
  };
}

export function architectDispatchDecision(
  decision: DispatchDecision,
  context: ContextSnapshot,
): ArchitectDecision {
  if (decision.category === "emergency") {
    return buildEmergencyDecision(decision, context);
  }

  if (decision.category === "info") {
    return buildInfoDecision(decision, context);
  }

  return buildRoutineDecision();
}
