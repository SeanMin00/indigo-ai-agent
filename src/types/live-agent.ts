export type SignalCategory = "emergency" | "info" | "routine" | "unknown";

export type SignalLabel =
  | "fire_alarm"
  | "emergency_vehicle_siren"
  | "crash"
  | "doorbell"
  | "baby_crying"
  | "hospital_pa"
  | "airport_pa"
  | "subway_pa"
  | "name_called"
  | "conversation"
  | "ambient_noise"
  | "unknown";

export type UserSituation =
  | "unknown"
  | "on_foot"
  | "driving"
  | "indoors"
  | "waiting_room"
  | "transit";

export type AgentCapability = {
  id: "dispatch" | "architect" | "context" | "executor" | "auditor";
  purpose: string;
  sourceMaterial: string;
};

export type AgentBlueprint = {
  id: "listen" | "dispatch" | "architect" | "context" | "executor" | "auditor";
  label: string;
  owns: string[];
};

export type AudioObservation = {
  transcript: string;
  detectedSignal: SignalLabel;
  confidence: number;
  timestampIso: string;
  source: "microphone" | "stream" | "simulation";
};

export type ListenAdapterInput = {
  transcript: string;
  source: AudioObservation["source"];
  hintSignal?: SignalLabel;
  confidenceHint?: number;
  capturedAtIso?: string;
};

export type DispatchDecision = {
  category: SignalCategory;
  signal: SignalLabel;
  confidence: number;
  routeTo: "architect";
  reasoning: string;
};

export type ContextSnapshot = {
  scenarioLabel?: string;
  locationLabel?: string;
  environmentLabel?: string;
  timeLabel?: string;
  weatherLabel?: string;
  userSituation: UserSituation;
  notes?: string[];
  personalization?: {
    priorityTuning?: "raise" | "lower" | "none";
    preferredWearableSignal?:
      | "strong-vibration"
      | "standard-vibration"
      | "visual-only";
    mutedSignals?: SignalLabel[];
  };
};

export type RawContextInput = {
  scenarioHint?: "emergency_vehicle" | "hospital_pa" | "airport_pa" | "home";
  city?: string;
  neighborhood?: string;
  venueType?: "street" | "hospital" | "airport" | "subway" | "home" | "unknown";
  userSituationHint?: UserSituation;
  timeHint?: "morning" | "afternoon" | "evening" | "night";
  weatherHint?: "clear" | "rain" | "snow" | "unknown";
  latitude?: number;
  longitude?: number;
  notes?: string[];
  personalization?: ContextSnapshot["personalization"];
};

export type ArchitectMode =
  | "emergency"
  | "info"
  | "awareness"
  | "personalization";

export type ArchitectDecision = {
  mode: ArchitectMode;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  userMessage: string;
  recommendedActions: string[];
  wearableSignal: "strong-vibration" | "standard-vibration" | "visual-only";
  escalation: "notify-now" | "surface-now" | "log-only";
};

export type ExecutorAction = {
  id:
    | "open-map"
    | "acknowledge"
    | "call-help"
    | "dismiss"
    | "view-summary";
  label: string;
};

export type AlertChannel = "phone-and-wearable" | "phone-only" | "log-only";

export type ExecutorDecision = {
  channel: AlertChannel;
  phoneTitle: string;
  phoneBody: string;
  wearableTitle: string;
  wearableBody: string;
  vibration: "strong" | "standard" | "none";
  actions: ExecutorAction[];
};

export type AgentPipelineResult = {
  rawContext: RawContextInput;
  context: ContextSnapshot;
  listenInput?: ListenAdapterInput;
  observation: AudioObservation;
  dispatch: DispatchDecision;
  architect: ArchitectDecision;
  executor: ExecutorDecision;
  trace: Array<"context" | "listen" | "dispatch" | "architect" | "executor">;
};

export type LiveAgentBlueprint = {
  category: "live-agent";
  primaryGoal: string;
  capabilities: AgentCapability[];
  agents: AgentBlueprint[];
  classifications: SignalCategory[];
  activePipeline: string[];
  demoScenarios: string[];
  transport: {
    audioInput: boolean;
    textFallback: boolean;
    videoInput: boolean;
  };
};
