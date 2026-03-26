import Link from "next/link";

const setupCards = [
  {
    title: "Application",
    items: [
      "Next.js App Router scaffold",
      "TypeScript, ESLint, and Prettier",
      "Health-check API route",
    ],
  },
  {
    title: "Data Layer",
    items: [
      "Prisma schema for sessions, transcripts, summaries, and alerts",
      "Supabase-ready PostgreSQL environment variables",
      "Shared Prisma client helper",
    ],
  },
  {
    title: "Collaboration",
    items: [
      "GitHub issue and PR templates",
      "Node version pinning",
      "CI workflow for lint and typecheck",
    ],
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <span className="pill">Build With AI Hackathon Starter</span>
        <h1>Base scaffold for an accessibility-focused AI agent.</h1>
        <p>
          This repo is ready for the next layer of work: user flows, Supabase
          project connection, authentication, and the first real-time AI
          interaction loop for deaf and hard-of-hearing users.
        </p>
        <p style={{ marginTop: 14 }}>
          <Link
            href="/gemini"
            style={{
              display: "inline-flex",
              padding: "10px 14px",
              borderRadius: 12,
              background: "var(--accent-soft)",
              color: "var(--accent)",
              fontWeight: 700,
              border: "1px solid var(--border)",
            }}
          >
            Gemini 테스트 열기
          </Link>
        </p>
      </section>

      <section className="grid" aria-label="Setup overview">
        {setupCards.map((card) => (
          <article className="card" key={card.title}>
            <h2>{card.title}</h2>
            <ul>
              {card.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}
