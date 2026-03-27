"use client";

import { useState } from "react";
import supabaseClient from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

type AuthScreenProps = {
  onSuccess: (user: User, registeredName: string) => void;
};

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registeredName, setRegisteredName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        const { data, error: signUpError } = await supabaseClient.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.user) throw new Error("Registration failed");

        const { error: profileError } = await supabaseClient
          .from("profiles")
          .insert({ id: data.user.id, registered_name: registeredName });
        if (profileError) throw profileError;

        onSuccess(data.user, registeredName);
      } else {
        const { data, error: signInError } =
          await supabaseClient.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        if (!data.user) throw new Error("Login failed");

        const { data: profile, error: profileError } = await supabaseClient
          .from("profiles")
          .select("registered_name")
          .eq("id", data.user.id)
          .single();
        if (profileError) throw profileError;

        onSuccess(data.user, profile.registered_name as string);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>myIndigo</h1>
        <p style={styles.subtitle}>
          {isRegister ? "Create an account" : "Sign in to continue"}
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={styles.input}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={styles.input}
        />

        {isRegister && (
          <input
            type="text"
            placeholder="Your name (for detection)"
            value={registeredName}
            onChange={(e) => setRegisteredName(e.target.value)}
            required
            style={styles.input}
          />
        )}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "..." : isRegister ? "Register" : "Log in"}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsRegister(!isRegister);
            setError("");
          }}
          style={styles.toggle}
        >
          {isRegister
            ? "Already have an account? Log in"
            : "Need an account? Register"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "#0a0a0a",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: 360,
    padding: 32,
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 16,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
  error: {
    padding: "8px 12px",
    borderRadius: 8,
    background: "#1a0808",
    border: "1px solid #E24B4A",
    color: "#E24B4A",
    fontSize: 13,
  },
  input: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #333",
    background: "#0a0a0a",
    color: "#fff",
    fontSize: 14,
    outline: "none",
  },
  button: {
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: "#7F77DD",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  toggle: {
    background: "none",
    border: "none",
    color: "#7F77DD",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
};
