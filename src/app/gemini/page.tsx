"use client";

import { useEffect, useState, type FormEvent } from "react";

type GeminiHealthResponse = {
  ok: boolean;
  provider: string;
  configured: boolean;
  model?: string;
};

export default function GeminiPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState<string>("");

  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/gemini/health")
      .then(async (r) => {
        const data = (await r.json()) as GeminiHealthResponse;
        if (cancelled) return;
        setConfigured(Boolean(data?.configured));
        setModel(data?.model ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setConfigured(false);
        setModel("");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("프롬프트를 입력하세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");

    try {
      const res = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : (data?.error?.message ?? "Gemini 요청 실패");
        throw new Error(message);
      }

      setResult(String(data?.text ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini 요청 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <span className="pill">Gemini Tester</span>
        <h1>Gemini /api/gemini/generate 테스트</h1>
        <p>현재 `configured` 상태와 생성 결과를 바로 확인할 수 있어요.</p>
      </section>

      <section className="grid" aria-label="Gemini test">
        <article className="card">
          <h2>Health</h2>
          <p>
            {configured === null ? (
              <>로딩 중...</>
            ) : configured ? (
              <>
                configured: <b>true</b>
              </>
            ) : (
              <>
                configured: <b>false</b>
              </>
            )}
          </p>
          <p>
            model: <b>{model || "—"}</b>
          </p>
        </article>

        <article className="card">
          <h2>Generate</h2>
          <form onSubmit={onSubmit}>
            <label style={{ display: "block", marginBottom: 8 }}>Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                resize: "vertical",
                padding: 12,
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "white",
                fontFamily: "inherit",
                marginBottom: 12,
              }}
              placeholder="예: 안녕하세요. 한글로 5줄 요약해줘."
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                marginBottom: 12,
              }}
            >
              {loading ? "생성 중..." : "Generate"}
            </button>
          </form>

          {error ? (
            <p style={{ color: "#b42318", whiteSpace: "pre-wrap" }}>{error}</p>
          ) : null}

          {result ? (
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "white",
                whiteSpace: "pre-wrap",
                overflowX: "auto",
                lineHeight: 1.5,
              }}
            >
              {result}
            </pre>
          ) : null}
        </article>
      </section>
    </main>
  );
}
