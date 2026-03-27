import type {
  RawContextInput,
  ContextSnapshot,
  UserSituation,
} from "@/types/live-agent";

function resolveUserSituation(input: RawContextInput): UserSituation {
  if (input.userSituationHint && input.userSituationHint !== "unknown") {
    return input.userSituationHint;
  }

  if (input.scenarioHint === "emergency_vehicle") {
    return "on_foot";
  }

  if (input.scenarioHint === "hospital_pa") {
    return "waiting_room";
  }

  if (input.scenarioHint === "airport_pa") {
    return "transit";
  }

  if (input.venueType === "home") {
    return "indoors";
  }

  return "unknown";
}

function buildLocationLabel(input: RawContextInput) {
  const parts = [input.neighborhood, input.city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function buildEnvironmentLabel(input: RawContextInput) {
  if (input.venueType === "hospital") {
    return "hospital waiting room";
  }

  if (input.venueType === "airport") {
    return "airport gate area";
  }

  if (input.venueType === "subway") {
    return "subway platform";
  }

  if (input.venueType === "street") {
    return "street crossing";
  }

  if (input.venueType === "home") {
    return "home";
  }

  return undefined;
}

function buildScenarioLabel(input: RawContextInput) {
  if (input.scenarioHint === "emergency_vehicle") {
    return "Emergency vehicle approaching from behind";
  }

  if (input.scenarioHint === "hospital_pa") {
    return "Hospital PA announcement";
  }

  if (input.scenarioHint === "airport_pa") {
    return "Airport public announcement";
  }

  if (input.scenarioHint === "home") {
    return "Home awareness monitoring";
  }

  return undefined;
}

function buildNotes(input: RawContextInput, userSituation: UserSituation) {
  const notes = [...(input.notes ?? [])];

  if (input.weatherHint && input.weatherHint !== "unknown") {
    notes.push(`Weather: ${input.weatherHint}`);
  }

  if (
    typeof input.latitude === "number" &&
    typeof input.longitude === "number"
  ) {
    notes.push(`Coordinates: ${input.latitude}, ${input.longitude}`);
  }

  notes.push(`User situation resolved to ${userSituation}`);
  return notes;
}

export function buildContextSnapshot(input: RawContextInput): ContextSnapshot {
  const userSituation = resolveUserSituation(input);

  return {
    scenarioLabel: buildScenarioLabel(input),
    locationLabel: buildLocationLabel(input),
    environmentLabel: buildEnvironmentLabel(input),
    timeLabel: input.timeHint,
    weatherLabel: input.weatherHint,
    userSituation,
    notes: buildNotes(input, userSituation),
    personalization: input.personalization,
  };
}
