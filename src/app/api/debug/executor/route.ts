import { NextRequest, NextResponse } from "next/server";
import { buildExecutorDecision } from "@/server/agents/executor";
import { executorFixtures } from "@/server/agents/executor-fixtures";
import type { ArchitectDecision, ContextSnapshot } from "@/types/live-agent";

export function GET() {
  return NextResponse.json({
    ok: true,
    fixtures: {
      emergency: buildExecutorDecision(
        executorFixtures.emergency.architect,
        executorFixtures.emergency.context,
      ),
      info: buildExecutorDecision(
        executorFixtures.info.architect,
        executorFixtures.info.context,
      ),
      awareness: buildExecutorDecision(
        executorFixtures.awareness.architect,
        executorFixtures.awareness.context,
      ),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    architect?: ArchitectDecision;
    context?: ContextSnapshot;
  };

  if (!body.architect || !body.context) {
    return NextResponse.json(
      {
        ok: false,
        error: "architect and context are required.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    result: buildExecutorDecision(body.architect, body.context),
  });
}
