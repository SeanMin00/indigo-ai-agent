import type { ListenAdapterInput } from "@/types/live-agent";

export const listenFixtures = {
  emergencyVehicle: {
    transcript: "I can hear a siren and a fire truck is approaching from behind.",
    source: "microphone",
    confidenceHint: 0.96,
  } satisfies ListenAdapterInput,
  hospitalPa: {
    transcript: "Alex Kim, please proceed to Exam Room 3 now.",
    source: "stream",
    confidenceHint: 0.92,
  } satisfies ListenAdapterInput,
  homeAwareness: {
    transcript: "The doorbell is ringing at the apartment entrance.",
    source: "microphone",
    confidenceHint: 0.9,
  } satisfies ListenAdapterInput,
};
