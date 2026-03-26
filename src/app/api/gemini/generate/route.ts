import { NextRequest, NextResponse } from "next/server";
import { generateGeminiText } from "@/lib/gemini/client";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    prompt?: string;
  };

  if (!body.prompt?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing prompt." },
      { status: 400 },
    );
  }

  try {
    const text = await generateGeminiText(body.prompt);

    return NextResponse.json({
      ok: true,
      text,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Gemini request failed.",
      },
      { status: 500 },
    );
  }
}
