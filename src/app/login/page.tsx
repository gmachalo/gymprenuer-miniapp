"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState("dev@gymtycoon.app");
  const [devName, setDevName]   = useState("Dev Trainer");
  const [devOpen, setDevOpen]   = useState(false);

  const handleSignIn = async (provider: string) => {
    setLoading(provider);
    await signIn(provider, { callbackUrl: "/dashboard" });
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("dev");
    await signIn("dev-login", {
      email: devEmail,
      name: devName,
      callbackUrl: "/dashboard",
    });
    setLoading(null);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Logo / Hero */}
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <div
          style={{
            fontSize: "64px",
            marginBottom: "16px",
            filter: "drop-shadow(0 0 20px rgba(108,71,255,0.6))",
          }}
        >
          🏋️
        </div>
        <h1
          style={{
            fontSize: "38px",
            fontWeight: 900,
            margin: 0,
            lineHeight: 1.1,
          }}
          className="gradient-text"
        >
          GYMPRENUER
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            marginTop: "10px",
            fontSize: "16px",
            fontWeight: 400,
          }}
        >
          Train. Build. Earn.
        </p>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "20px",
          }}
        >
          {["🏅 Character RPG", "🏢 Gym Ownership", "💰 Earn Tokens"].map((f) => (
            <span key={f} className="badge badge-purple">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Sign-in card */}
      <div
        className="glass"
        style={{
          width: "100%",
          maxWidth: "360px",
          padding: "32px 24px",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 700,
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Start Your Journey
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "14px",
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          No wallet required. Connect later to earn on-chain.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            id="login-google"
            className="btn btn-secondary"
            style={{ width: "100%", gap: "12px", fontSize: "15px" }}
            onClick={() => handleSignIn("google")}
            disabled={!!loading}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading === "google" ? "Connecting..." : "Continue with Google"}
          </button>

          <button
            id="login-discord"
            className="btn btn-secondary"
            style={{ width: "100%", gap: "12px", fontSize: "15px" }}
            onClick={() => handleSignIn("discord")}
            disabled={!!loading}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="#5865F2"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.04.028.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 13.84 13.84 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
            {loading === "discord" ? "Connecting..." : "Continue with Discord"}
          </button>
        </div>

        {/* ── Dev Login (development only) ── */}
        <div style={{ marginTop: "20px" }}>
          <button
            id="dev-login-toggle"
            onClick={() => setDevOpen((o) => !o)}
            style={{
              width: "100%",
              background: "none",
              border: "1px dashed rgba(108,71,255,0.4)",
              borderRadius: "10px",
              color: "var(--text-muted)",
              fontSize: "12px",
              padding: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            🛠️ Dev Login (no OAuth needed) {devOpen ? "▲" : "▼"}
          </button>

          {devOpen && (
            <form
              onSubmit={handleDevLogin}
              style={{
                marginTop: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "16px",
                background: "rgba(108,71,255,0.06)",
                border: "1px solid rgba(108,71,255,0.2)",
                borderRadius: "10px",
              }}
            >
              <input
                id="dev-email"
                className="input"
                type="email"
                placeholder="dev@gymtycoon.app"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                required
                style={{ fontSize: "14px" }}
              />
              <input
                id="dev-name"
                className="input"
                type="text"
                placeholder="Dev Trainer"
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
                style={{ fontSize: "14px" }}
              />
              <button
                id="dev-login-submit"
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={loading === "dev"}
              >
                {loading === "dev" ? "Logging in..." : "🚀 Enter as Dev"}
              </button>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                Dev mode only — requires DATABASE_URL to be set
              </p>
            </form>
          )}
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: "12px",
            color: "var(--text-muted)",
            marginTop: "16px",
          }}
        >
          By continuing you agree to our Terms. Wallet linking is always optional.
        </p>
      </div>

      {/* Bottom decorative */}
      <div
        style={{
          marginTop: "40px",
          display: "flex",
          gap: "24px",
          color: "var(--text-muted)",
          fontSize: "13px",
        }}
      >
        {["🌐 Base Network", "🛡️ Non-Custodial", "🆓 Free to Play"].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
