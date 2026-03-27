import {
  emergencyVehicleContextInputFixture,
  homeAwarenessContextInputFixture,
  hospitalPaContextInputFixture,
} from "@/server/agents/context-fixtures";
import {
  ambientNoiseFixture,
  emergencyVehicleFixture,
  hospitalPaFixture,
} from "@/server/agents/dispatch-fixtures";

export const pipelineFixtures = {
  emergencyVehicle: {
    observation: emergencyVehicleFixture,
    rawContext: emergencyVehicleContextInputFixture,
  },
  hospitalPa: {
    observation: hospitalPaFixture,
    rawContext: hospitalPaContextInputFixture,
  },
  ambientRoutine: {
    observation: ambientNoiseFixture,
    rawContext: homeAwarenessContextInputFixture,
  },
};
