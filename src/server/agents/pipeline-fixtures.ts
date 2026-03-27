import {
  emergencyVehicleContextInputFixture,
  homeAwarenessContextInputFixture,
  hospitalPaContextInputFixture,
} from "@/server/agents/context-fixtures";
import {
  ambientNoiseObservationFixture,
  emergencyVehicleObservationFixture,
  hospitalPaObservationFixture,
} from "@/server/agents/dispatch-fixtures";

export const pipelineFixtures = {
  emergencyVehicle: {
    observation: emergencyVehicleObservationFixture,
    rawContext: emergencyVehicleContextInputFixture,
  },
  hospitalPa: {
    observation: hospitalPaObservationFixture,
    rawContext: hospitalPaContextInputFixture,
  },
  ambientRoutine: {
    observation: ambientNoiseObservationFixture,
    rawContext: homeAwarenessContextInputFixture,
  },
};
