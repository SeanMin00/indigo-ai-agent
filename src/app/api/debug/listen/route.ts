import { NextRequest, NextResponse } from "next/server";
import { adaptListenInput } from "@/server/agents/listen";
import { listenFixtures } from "@/server/agents/listen-fixtures";
import type { ListenAdapterInput } from "@/types/live-agent";

export function GET() {
  return NextResponse.json({
    ok: true,
    fixtures: {
      emergencyVehicle: adaptListenInput(listenFixtures.emergencyVehicle),
      hospitalPa: adaptListenInput(listenFixtures.hospitalPa),
      homeAwareness: adaptListenInput(listenFixtures.homeAwareness),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    input?: ListenAdapterInput;
  };

  if (!body.input) {
    return NextResponse.json(
      {
        ok: false,
        error: "input is required.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    observation: adaptListenInput(body.input),
  });
}
