"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { AgentPipelineResult, LiveIngestRequest } from "@/types/live-agent";

// Messages FROM backend
export type ServerMessage =
  | { type: "sound_detected"; text: string; latency_ms: number }
  | {
      type: "agent_update";
      agent: string;
      status: "active" | "done";
      output: string;
    }
  | {
      type: "alert";
      scenario: "siren" | "name";
      title: string;
      subtitle: string;
      risk: string;
    };

type UseAgentWebSocketOptions = {
  url: string;
  userName: string;
  userId: string;
  scenario: "siren" | "hospital";
  onMessage: (msg: ServerMessage) => void;
  onConnectionChange?: (connected: boolean) => void;
};

type DemoScenarioConfig = {
  transcript: string;
  rawContext: LiveIngestRequest["rawContext"];
};

function getScenarioConfig(
  scenario: "siren" | "hospital",
  userName: string,
): DemoScenarioConfig {
  if (scenario === "hospital") {
    return {
      transcript: `${userName}, please proceed to Exam Room 3 now.`,
      rawContext: {
        scenarioHint: "hospital_pa",
        city: "New York City",
        neighborhood: "Midtown East",
        venueType: "hospital",
        userSituationHint: "waiting_room",
        timeHint: "morning",
        weatherHint: "clear",
        notes: ["Lobby announcement", "Need concise navigation support"],
      },
    };
  }

  return {
    transcript: "I can hear a siren and a fire truck is approaching from behind.",
    rawContext: {
      scenarioHint: "emergency_vehicle",
      city: "New York City",
      neighborhood: "Chelsea",
      venueType: "street",
      userSituationHint: "on_foot",
      timeHint: "afternoon",
      weatherHint: "clear",
      notes: ["Outdoor demo route", "User is walking alone"],
    },
  };
}

function toServerMessages(
  result: AgentPipelineResult,
  scenario: "siren" | "hospital",
): ServerMessage[] {
  const specialistAgent =
    result.architect.mode === "emergency" ? "vehicle" : "name";
  const alertScenario = scenario === "hospital" ? "name" : "siren";
  const firstAction = result.architect.recommendedActions[0] ?? "Check details";
  const risk = result.architect.severity.toUpperCase();

  return [
    {
      type: "sound_detected",
      text: result.observation.detectedSignal.replaceAll("_", " "),
      latency_ms: Math.round(result.observation.confidence * 1000),
    },
    {
      type: "agent_update",
      agent: "dispatch",
      status: "active",
      output: `DispatchAgent: classifying ${result.observation.detectedSignal.replaceAll("_", " ")}`,
    },
    {
      type: "agent_update",
      agent: "dispatch",
      status: "done",
      output: result.dispatch.reasoning,
    },
    {
      type: "agent_update",
      agent: specialistAgent,
      status: "active",
      output: `${result.architect.mode} architect: evaluating context and next action`,
    },
    {
      type: "agent_update",
      agent: specialistAgent,
      status: "done",
      output: `${result.architect.title} — ${firstAction}`,
    },
    {
      type: "alert",
      scenario: alertScenario,
      title: result.executor.phoneTitle,
      subtitle: result.executor.phoneBody,
      risk,
    },
  ];
}

export function useAgentWebSocket({
  url,
  userName,
  userId,
  scenario,
  onMessage,
  onConnectionChange,
}: UseAgentWebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const runTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inFlightRef = useRef(false);

  // Keep refs fresh without triggering reconnect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  const connect = useCallback(() => {
    if (connected) return;

    void url;
    void userId;

    setConnected(true);
    onConnectionChangeRef.current?.(true);
  }, [connected, url, userId]);

  const disconnect = useCallback(() => {
    if (runTimeoutRef.current) {
      clearTimeout(runTimeoutRef.current);
      runTimeoutRef.current = null;
    }

    messageTimeoutsRef.current.forEach(clearTimeout);
    messageTimeoutsRef.current = [];
    inFlightRef.current = false;
    setConnected(false);
    onConnectionChangeRef.current?.(false);
  }, []);

  const runPipeline = useCallback(async (forceRun?: boolean) => {
    if ((!connected && !forceRun) || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;

    try {
      const scenarioConfig = getScenarioConfig(scenario, userName);
      const response = await fetch("/api/live/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listenInput: {
            transcript: scenarioConfig.transcript,
            source: "microphone",
            confidenceHint: scenario === "siren" ? 0.96 : 0.91,
          },
          rawContext: scenarioConfig.rawContext,
        } satisfies LiveIngestRequest),
      });

      const payload = (await response.json()) as
        | { ok: true; result: AgentPipelineResult }
        | { ok: false; error: string };

      if (!response.ok || !payload.ok) {
        throw new Error(
          "error" in payload ? payload.error : "Live ingest request failed.",
        );
      }

      const messages = toServerMessages(payload.result, scenario);

      messageTimeoutsRef.current.forEach(clearTimeout);
      messageTimeoutsRef.current = messages.map((message, index) =>
        setTimeout(() => {
          onMessageRef.current(message);
        }, 500 + index * 450),
      );
    } catch {
      onMessageRef.current({
        type: "alert",
        scenario: scenario === "hospital" ? "name" : "siren",
        title: "Pipeline unavailable",
        subtitle: "Check local API routes and try again",
        risk: "LOW",
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [connected, scenario, userName]);

  const sendAudioChunk = useCallback(
    (_base64: string) => {
      if (!connected) {
        return;
      }

      if (runTimeoutRef.current) {
        clearTimeout(runTimeoutRef.current);
      }

      runTimeoutRef.current = setTimeout(() => {
        void runPipeline();
      }, 900);
    },
    [connected, runPipeline],
  );

  const runScenarioDemo = useCallback(() => {
    void runPipeline(true);
  }, [runPipeline]);

  return { connected, connect, disconnect, sendAudioChunk, runScenarioDemo };
}
