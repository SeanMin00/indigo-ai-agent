"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { AgentPipelineResult, RawContextInput } from "@/types/live-agent";

type DemoScenario = {
  id: "emergencyVehicle" | "hospitalPa" | "homeAwareness";
  label: string;
  shortLabel: string;
  subtitle: string;
  transcript: string;
  rawContext: RawContextInput;
};

const demoScenarios: DemoScenario[] = [
  {
    id: "emergencyVehicle",
    label: "Emergency Vehicle",
    shortLabel: "Hazard",
    subtitle: "Fire truck approaching from behind on a Chelsea sidewalk.",
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
  },
  {
    id: "hospitalPa",
    label: "Hospital Announcement",
    shortLabel: "Info",
    subtitle: "A waiting-room PA calls the user to Exam Room 3.",
    transcript: "Alex Kim, please proceed to Exam Room 3 now.",
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
  },
  {
    id: "homeAwareness",
    label: "Home Awareness",
    shortLabel: "Aware",
    subtitle: "A doorbell rings while the user is indoors at home.",
    transcript: "The doorbell is ringing at the apartment entrance.",
    rawContext: {
      scenarioHint: "home",
      city: "New York City",
      neighborhood: "Brooklyn",
      venueType: "home",
      userSituationHint: "indoors",
      timeHint: "evening",
      weatherHint: "rain",
      notes: ["Apartment building entrance", "Awareness-only notification"],
    },
  },
];

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function joinNonEmpty(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" · ");
}

export default function DemoPage() {
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<DemoScenario["id"]>("emergencyVehicle");
  const [transcript, setTranscript] = useState(demoScenarios[0].transcript);
  const [result, setResult] = useState<AgentPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedScenario = useMemo(
    () =>
      demoScenarios.find((scenario) => scenario.id === selectedScenarioId) ??
      demoScenarios[0],
    [selectedScenarioId],
  );

  const contextLine = joinNonEmpty([
    result?.context.locationLabel,
    result?.context.environmentLabel,
    result?.context.timeLabel,
    result?.context.weatherLabel,
  ]);

  async function runScenario() {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/live/ingest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            listenInput: {
              transcript,
              source: "microphone",
              confidenceHint:
                selectedScenarioId === "emergencyVehicle" ? 0.96 : 0.91,
            },
            rawContext: selectedScenario.rawContext,
          }),
        });

        const payload = (await response.json()) as
          | { ok: true; result: AgentPipelineResult }
          | { ok: false; error: string };

        if (!response.ok || !payload.ok) {
          throw new Error(
            "error" in payload ? payload.error : "Pipeline request failed.",
          );
        }

        setResult(payload.result);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to run the demo scenario.",
        );
      }
    });
  }

  function selectScenario(scenario: DemoScenario) {
    setSelectedScenarioId(scenario.id);
    setTranscript(scenario.transcript);
    setError(null);
  }

  return (
    <main className="demo-page">
      <section className="demo-canvas">
        <section className="demo-hero-v2">
          <div className="demo-copy-v2">
            <span className="demo-brand">myIndigo</span>
            <h1>Technology that understands signals and takes action.</h1>
            <p>
              A live multi-agent system for deaf and hard-of-hearing users:
              listen to the world, classify urgency, reason with context, and
              surface calm guidance across phone and wearable screens.
            </p>
            <div className="demo-tag-row">
              <span className="demo-tag">Inclusive Design</span>
              <span className="demo-tag">AI Agent</span>
              <span className="demo-tag">Safety &amp; Security</span>
              <span className="demo-tag">Gemini Live + ADK</span>
            </div>
          </div>

          <div className="hero-sidecard">
            <span className="panel-kicker panel-kicker-dark">Presentation mode</span>
            <h2>One flawless demo, not a full product.</h2>
            <p>
              Scenario-driven input, deterministic orchestration, and a visual
              alert surface that makes the agent chain easy to explain on stage.
            </p>
            <div className="hero-sidecard-actions">
              <Link className="demo-secondary-link" href="/">
                Back home
              </Link>
              <button
                className="demo-primary-button"
                disabled={isPending}
                onClick={runScenario}
                type="button"
              >
                {isPending ? "Running..." : "Run selected scenario"}
              </button>
            </div>
          </div>
        </section>

        <section className="scenario-tabs" aria-label="Demo scenarios">
          {demoScenarios.map((scenario) => {
            const isSelected = scenario.id === selectedScenarioId;

            return (
              <button
                className={`scenario-tab${isSelected ? " is-selected" : ""}`}
                key={scenario.id}
                onClick={() => selectScenario(scenario)}
                type="button"
              >
                <span>{scenario.shortLabel}</span>
                <strong>{scenario.label}</strong>
              </button>
            );
          })}
        </section>

        <section className="demo-stage">
          <article className="narrative-card">
            <span className="panel-kicker panel-kicker-dark">Live input</span>
            <h2>{selectedScenario.label}</h2>
            <p>{selectedScenario.subtitle}</p>

            <label className="input-label" htmlFor="demo-transcript">
              Transcript / ASR fallback
            </label>
            <textarea
              className="demo-textarea-v2"
              id="demo-transcript"
              onChange={(event) => setTranscript(event.target.value)}
              value={transcript}
            />

            <div className="seed-grid">
              <div className="seed-card">
                <span className="panel-kicker">Context seed</span>
                <p>
                  {joinNonEmpty([
                    selectedScenario.rawContext.city,
                    selectedScenario.rawContext.neighborhood,
                    selectedScenario.rawContext.venueType,
                    selectedScenario.rawContext.userSituationHint,
                  ])}
                </p>
              </div>
              <div className="seed-card">
                <span className="panel-kicker">Reasoning mode</span>
                <p>Listen → Understand → Act with context-aware escalation.</p>
              </div>
            </div>

            <div className="flow-track" aria-label="Pipeline stages">
              {["listen", "dispatch", "architect", "executor"].map((stage) => (
                <span className="flow-node" key={stage}>
                  {stage}
                </span>
              ))}
            </div>

            {error ? <div className="demo-error-banner">{error}</div> : null}
          </article>

          <article className="device-showcase">
            <div className="phone-mock">
              <div className="phone-topbar">
                <span>Chelsea, NY</span>
                <span>{result?.architect.severity ?? "ready"}</span>
              </div>
              <div className="phone-radar">
                <div className="radar-ring radar-ring-1" />
                <div className="radar-ring radar-ring-2" />
                <div className="radar-ring radar-ring-3" />
                <div className="radar-center" />
                <div className="radar-signal" />
              </div>
              <div className="phone-alert-card">
                <span className="alert-badge">
                  {result?.dispatch.category ?? "pipeline"}
                </span>
                <h3>{result?.executor.phoneTitle ?? "Waiting for scenario"}</h3>
                <p>
                  {result?.executor.phoneBody ??
                    "Run a scenario to preview the phone-side alert experience."}
                </p>
              </div>
              <div className="phone-actions">
                {(result?.executor.actions ?? []).slice(0, 3).map((action) => (
                  <span className="phone-action-pill" key={action.id}>
                    {action.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="wearable-column">
              <div className="watch-mock">
                <div className="watch-icon" />
                <div className="watch-title">
                  {result?.executor.wearableTitle ?? "Awaiting alert"}
                </div>
                <div className="watch-body">
                  {result?.executor.wearableBody ??
                    "Wearable guidance appears here with concise instructions."}
                </div>
                <div className="watch-footer">
                  <span>Vibration</span>
                  <strong>{result?.executor.vibration ?? "none"}</strong>
                </div>
              </div>

              <div className="system-summary">
                <span className="panel-kicker">System output</span>
                <div className="summary-row">
                  <span>Context</span>
                  <strong>{contextLine || "Not generated yet"}</strong>
                </div>
                <div className="summary-row">
                  <span>Dispatch</span>
                  <strong>{result?.dispatch.category ?? "pending"}</strong>
                </div>
                <div className="summary-row">
                  <span>Architect</span>
                  <strong>{result?.architect.mode ?? "pending"}</strong>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="analysis-grid">
          <article className="analysis-card">
            <span className="panel-kicker panel-kicker-dark">Agent reasoning</span>
            <h2>Stage-by-stage decisions</h2>
            <div className="analysis-stack">
              <div className="analysis-item">
                <span className="analysis-label">Listen</span>
                <p>
                  {result?.observation.transcript ??
                    "Transcript and inferred signal will appear here."}
                </p>
              </div>
              <div className="analysis-item">
                <span className="analysis-label">Dispatch</span>
                <p>
                  {result
                    ? `${result.dispatch.signal} classified as ${result.dispatch.category} with ${(result.dispatch.confidence * 100).toFixed(0)}% confidence.`
                    : "Dispatch will classify the signal as emergency, info, or routine."}
                </p>
              </div>
              <div className="analysis-item">
                <span className="analysis-label">Architect</span>
                <p>
                  {result?.architect.userMessage ??
                    "Architect converts the event into severity, guidance, and escalation."}
                </p>
              </div>
              <div className="analysis-item">
                <span className="analysis-label">Executor</span>
                <p>
                  {result
                    ? `Surface on ${result.executor.channel} with ${result.executor.vibration} vibration.`
                    : "Executor packages the result for phone and wearable outputs."}
                </p>
              </div>
            </div>
          </article>

          <article className="analysis-card system-card">
            <span className="panel-kicker panel-kicker-dark">System layers</span>
            <h2>Demo architecture</h2>
            <div className="system-layers">
              <div className="layer-pill">Browser (React)</div>
              <div className="layer-arrow">→</div>
              <div className="layer-pill is-teal">FastAPI / Next bridge</div>
              <div className="layer-arrow">→</div>
              <div className="layer-pill is-purple">Gemini Live</div>
              <div className="layer-arrow">→</div>
              <div className="layer-pill is-red">ADK Agent Chain</div>
            </div>
            <div className="system-notes">
              <div className="note-box">
                <strong>Realtime audio</strong>
                <p>Listen adapter keeps the pipeline compatible with future microphone streaming.</p>
              </div>
              <div className="note-box">
                <strong>Context aware</strong>
                <p>Location, venue, and user situation shape the final guidance message.</p>
              </div>
              <div className="note-box">
                <strong>Wearable first</strong>
                <p>Executor always prepares concise phone and watch payloads for demo delivery.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="raw-output-card">
          <div className="raw-header">
            <div>
              <span className="panel-kicker panel-kicker-dark">Raw payloads</span>
              <h2>Debug view for judges and engineers</h2>
            </div>
            <span className="trace-chip">
              {result?.trace.join(" → ") ?? "context → listen → dispatch → architect → executor"}
            </span>
          </div>
          <div className="raw-grid">
            <details className="raw-details" open>
              <summary>Observation</summary>
              <pre>{prettyJson(result?.observation ?? null)}</pre>
            </details>
            <details className="raw-details" open>
              <summary>Dispatch</summary>
              <pre>{prettyJson(result?.dispatch ?? null)}</pre>
            </details>
            <details className="raw-details">
              <summary>Architect</summary>
              <pre>{prettyJson(result?.architect ?? null)}</pre>
            </details>
            <details className="raw-details">
              <summary>Executor</summary>
              <pre>{prettyJson(result?.executor ?? null)}</pre>
            </details>
          </div>
        </section>
      </section>
    </main>
  );
}
