import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "ai-agent-hackathon",
    timestamp: new Date().toISOString(),
  });
}
