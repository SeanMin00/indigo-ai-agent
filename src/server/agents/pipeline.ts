import { architectDispatchDecision } from "@/server/agents/architect";
import { buildContextSnapshot } from "@/server/agents/context";
import { dispatchAudioObservation } from "@/server/agents/dispatch";
import type {
  AgentPipelineResult,
  AudioObservation,
  RawContextInput,
} from "@/types/live-agent";

export function runAgentPipeline(
  observation: AudioObservation,
  rawContext: RawContextInput,
): AgentPipelineResult {
  const context = buildContextSnapshot(rawContext);
  const dispatch = dispatchAudioObservation(observation);
  const architect = architectDispatchDecision(dispatch, context);

  return {
    rawContext,
    context,
    observation,
    dispatch,
    architect,
    trace: ["context", "listen", "dispatch", "architect"],
  };
}
