"use client";

import { useState, useEffect } from "react";
import supabaseClient from "@/lib/supabaseClient";
import AuthScreen from "@/components/AuthScreen";
import DemoScreen from "@/components/DemoScreen";
import type { User } from "@supabase/supabase-js";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        supabaseClient
          .from("profiles")
          .select("registered_name")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            setUserName((data?.registered_name as string) ?? "User");
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onSuccess={(u, name) => {
          setUser(u);
          setUserName(name);
        }}
      />
    );
  }

  return (
    <DemoScreen
      userName={userName}
      onLogout={async () => {
        await supabaseClient.auth.signOut();
        setUser(null);
        setUserName("");
      }}
    />
  );
}
