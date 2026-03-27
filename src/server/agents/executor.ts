import type {
  ArchitectDecision,
  ContextSnapshot,
  ExecutorAction,
  ExecutorDecision,
} from "@/types/live-agent";

function buildActions(decision: ArchitectDecision): ExecutorAction[] {
  if (decision.severity === "critical") {
    return [
      { id: "call-help", label: "Need help" },
      { id: "open-map", label: "Show map" },
      { id: "acknowledge", label: "I'm OK" },
    ];
  }

  if (decision.severity === "high") {
    return [
      { id: "open-map", label: "Show map" },
      { id: "acknowledge", label: "Got it" },
    ];
  }

  if (decision.severity === "medium") {
    return [
      { id: "view-summary", label: "View summary" },
      { id: "acknowledge", label: "Got it" },
    ];
  }

  return [{ id: "dismiss", label: "Dismiss" }];
}

function resolveChannel(decision: ArchitectDecision): ExecutorDecision["channel"] {
  if (decision.escalation === "log-only") {
    return "log-only";
  }

  if (decision.severity === "low" && decision.wearableSignal === "visual-only") {
    return "phone-only";
  }

  return "phone-and-wearable";
}

function resolveVibration(
  decision: ArchitectDecision,
): ExecutorDecision["vibration"] {
  if (decision.wearableSignal === "strong-vibration") {
    return "strong";
  }

  if (decision.wearableSignal === "standard-vibration") {
    return "standard";
  }

  return "none";
}

function buildWearableBody(
  decision: ArchitectDecision,
  context: ContextSnapshot,
) {
  const firstAction = decision.recommendedActions[0];
  const locationSuffix = context.locationLabel ? ` · ${context.locationLabel}` : "";

  if (!firstAction) {
    return `${decision.userMessage}${locationSuffix}`.trim();
  }

  return `${firstAction}${locationSuffix}`;
}

export function buildExecutorDecision(
  decision: ArchitectDecision,
  context: ContextSnapshot,
): ExecutorDecision {
  return {
    channel: resolveChannel(decision),
    phoneTitle: decision.title,
    phoneBody: decision.userMessage,
    wearableTitle: decision.title,
    wearableBody: buildWearableBody(decision, context),
    vibration: resolveVibration(decision),
    actions: buildActions(decision),
  };
}
