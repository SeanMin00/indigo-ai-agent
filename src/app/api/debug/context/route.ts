import { NextRequest, NextResponse } from "next/server";
import { buildContextSnapshot } from "@/server/agents/context";
import {
  airportPaContextInputFixture,
  emergencyVehicleContextInputFixture,
  hospitalPaContextInputFixture,
} from "@/server/agents/context-fixtures";
import type { RawContextInput } from "@/types/live-agent";

export function GET() {
  return NextResponse.json({
    ok: true,
    fixtures: {
      emergencyVehicle: buildContextSnapshot(
        emergencyVehicleContextInputFixture,
      ),
      hospitalPa: buildContextSnapshot(hospitalPaContextInputFixture),
      airportPa: buildContextSnapshot(airportPaContextInputFixture),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    input?: RawContextInput;
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
    result: buildContextSnapshot(body.input),
  });
}
