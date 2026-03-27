import { NextRequest, NextResponse } from "next/server";
import { runAgentPipeline } from "@/server/agents/pipeline";
import { pipelineFixtures } from "@/server/agents/pipeline-fixtures";
import type { AudioObservation, RawContextInput } from "@/types/live-agent";

export function GET() {
  return NextResponse.json({
    ok: true,
    fixtures: {
      emergencyVehicle: runAgentPipeline(
        pipelineFixtures.emergencyVehicle.observation,
        pipelineFixtures.emergencyVehicle.rawContext,
      ),
      hospitalPa: runAgentPipeline(
        pipelineFixtures.hospitalPa.observation,
        pipelineFixtures.hospitalPa.rawContext,
      ),
      ambientRoutine: runAgentPipeline(
        pipelineFixtures.ambientRoutine.observation,
        pipelineFixtures.ambientRoutine.rawContext,
      ),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    observation?: AudioObservation;
    rawContext?: RawContextInput;
  };

  if (!body.observation || !body.rawContext) {
    return NextResponse.json(
      {
        ok: false,
        error: "observation and rawContext are required.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    result: runAgentPipeline(body.observation, body.rawContext),
  });
}
