import { NextRequest, NextResponse } from "next/server";
import { runAgentPipeline, runListenPipeline } from "@/server/agents/pipeline";
import { listenFixtures } from "@/server/agents/listen-fixtures";
import { pipelineFixtures } from "@/server/agents/pipeline-fixtures";
import type {
  AudioObservation,
  ListenAdapterInput,
  RawContextInput,
} from "@/types/live-agent";

export function GET() {
  return NextResponse.json({
    ok: true,
    fixtures: {
      emergencyVehicle: runListenPipeline(
        listenFixtures.emergencyVehicle,
        pipelineFixtures.emergencyVehicle.rawContext,
      ),
      hospitalPa: runListenPipeline(
        listenFixtures.hospitalPa,
        pipelineFixtures.hospitalPa.rawContext,
      ),
      ambientRoutine: runListenPipeline(
        listenFixtures.homeAwareness,
        pipelineFixtures.ambientRoutine.rawContext,
      ),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    observation?: AudioObservation;
    listenInput?: ListenAdapterInput;
    rawContext?: RawContextInput;
  };

  if (!body.rawContext) {
    return NextResponse.json(
      {
        ok: false,
        error: "rawContext is required.",
      },
      { status: 400 },
    );
  }

  if (body.listenInput) {
    return NextResponse.json({
      ok: true,
      result: runListenPipeline(body.listenInput, body.rawContext),
    });
  }

  if (!body.observation) {
    return NextResponse.json(
      {
        ok: false,
        error: "observation or listenInput is required.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    result: runAgentPipeline(body.observation, body.rawContext),
  });
}
