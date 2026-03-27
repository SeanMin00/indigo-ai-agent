import { architectDispatchDecision } from "@/server/agents/architect";
import {
  awarenessContextFixture,
  awarenessDispatchFixture,
  emergencyContextFixture,
  emergencyDispatchFixture,
  infoContextFixture,
  infoDispatchFixture,
} from "@/server/agents/architect-fixtures";

export const executorFixtures = {
  emergency: {
    architect: architectDispatchDecision(
      emergencyDispatchFixture,
      emergencyContextFixture,
    ),
    context: emergencyContextFixture,
  },
  info: {
    architect: architectDispatchDecision(infoDispatchFixture, infoContextFixture),
    context: infoContextFixture,
  },
  awareness: {
    architect: architectDispatchDecision(
      awarenessDispatchFixture,
      awarenessContextFixture,
    ),
    context: awarenessContextFixture,
  },
};
