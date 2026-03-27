import { NextRequest, NextResponse } from "next/server";
import { dispatchAudioObservation } from "@/server/agents/dispatch";
import {
  ambientNoiseFixture,
  emergencyVehicleFixture,
  hospitalPaFixture,
} from "@/server/agents/dispatch-fixtures";
import type { AudioObservation } from "@/types/live-agent";

export function GET() {
  const emergency = dispatchAudioObservation(emergencyVehicleFixture);
  const info = dispatchAudioObservation(hospitalPaFixture);
  const routine = dispatchAudioObservation(ambientNoiseFixture);

  return NextResponse.json({
    ok: true,
    fixtures: {
      emergency_vehicle_siren: emergency,
      hospital_pa: info,
      ambient_noise: routine,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<AudioObservation>;

  if (!body.detectedSignal || !body.transcript) {
    return NextResponse.json(
      { ok: false, error: "Missing detectedSignal or transcript." },
      { status: 400 },
    );
  }

  const observation: AudioObservation = {
    detectedSignal: body.detectedSignal,
    transcript: body.transcript,
    confidence: typeof body.confidence === "number" ? body.confidence : 1,
    timestampIso: body.timestampIso ?? new Date().toISOString(),
    source: body.source ?? "simulation",
  };

  return NextResponse.json({
    ok: true,
    decision: dispatchAudioObservation(observation),
  });
}
