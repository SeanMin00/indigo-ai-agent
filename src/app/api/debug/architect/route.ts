import { NextRequest, NextResponse } from "next/server";
import { architectDispatchDecision } from "@/server/agents/architect";
import {
  emergencyContextFixture,
  emergencyDispatchFixture,
  infoContextFixture,
  infoDispatchFixture,
} from "@/server/agents/architect-fixtures";
import type { ContextSnapshot, DispatchDecision } from "@/types/live-agent";

type ArchitectDebugBody = {
  decision?: DispatchDecision;
  context?: ContextSnapshot;
};

export function GET() {
  return NextResponse.json({
    ok: true,
    fixtures: {
      emergency_vehicle_siren: architectDispatchDecision(
        emergencyDispatchFixture,
        emergencyContextFixture,
      ),
      hospital_pa: architectDispatchDecision(
        infoDispatchFixture,
        infoContextFixture,
      ),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ArchitectDebugBody;
  if (!body.decision) {
    return NextResponse.json(
      { ok: false, error: "Missing dispatch decision." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    architect: architectDispatchDecision(body.decision, body.context ?? { userSituation: "unknown" }),
  });
}
