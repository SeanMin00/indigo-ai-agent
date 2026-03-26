import { NextResponse } from "next/server";
import { getGeminiRuntimeConfig } from "@/lib/gemini/client";

export function GET() {
  return NextResponse.json({
    ok: true,
    provider: "gemini",
    ...getGeminiRuntimeConfig(),
  });
}
