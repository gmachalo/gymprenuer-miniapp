"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface ProviderOption {
  id: string;
  label: string;
  blurb: string;
  icon: string;
  configured: boolean;
  pushOnly: boolean;
}

interface Connection {
  provider: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

interface StatBlock {
  strength: number;
  stamina: number;
  discipline: number;
  metabolism: number;
}

interface PullResult {
  provider: string;
  pulled: number;
  imported: number;
  counted: number;
  totalGain: StatBlock;
  stats: StatBlock | null;
  requiredStat: number;
  remainingToLevel: StatBlock | null;
}

const STAT_LABELS: [keyof StatBlock, string, string][] = [
  ["strength", "STR", "var(--stat-strength)"],
  ["stamina", "STA", "var(--stat-stamina)"],
  ["discipline", "DIS", "var(--stat-discipline)"],
  ["metabolism", "MET", "var(--stat-metabolism)"],
];

export default function FitnessConnectCard({ requiredStat }: { requiredStat: number }) {
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pull, setPull] = useState<PullResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Bumped after any action that changes the link, to re-read it from the server.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fitness/connect")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setProviders(data.providers ?? []);
        setConnection(data.connection ?? null);
      })
      .catch(() => {
        /* leave the card in its empty state */
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // The OAuth callback bounces back here with the outcome in the query string —
  // derived at render time rather than mirrored into state.
  const callbackStatus = searchParams.get("fitness");
  const callbackNotice =
    callbackStatus === "linked"
      ? "Workout app linked — pull your sessions to bank the stats."
      : callbackStatus === "error"
      ? `Could not link that app (${searchParams.get("reason") ?? "unknown error"}).`
      : null;

  const connect = async (provider: string) => {
    setBusy(provider);
    setMessage(null);
    try {
      const res = await fetch("/api/fitness/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Could not start the link");
        return;
      }
      if (data.authorizeUrl) {
        window.location.href = data.authorizeUrl;
        return;
      }
      reload();
      setMessage("Linked. Pull your sessions to bank the stats.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await fetch("/api/fitness/connect", { method: "DELETE" });
      setPull(null);
      setMessage("Unlinked. Stats you already earned are kept.");
      reload();
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("pull");
    setMessage(null);
    try {
      const res = await fetch("/api/fitness/pull", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Sync failed");
        return;
      }
      setPull(data);
      reload();
    } catch {
      setMessage("Sync failed");
    } finally {
      setBusy(null);
    }
  };

  const active = providers.find((p) => p.id === connection?.provider);
  const gained = pull ? Object.values(pull.totalGain).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <p className="section-title" style={{ margin: "0 0 4px" }}>🔗 Your Workout App</p>
      <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Link the app you actually train with. Real sessions raise your character&apos;s stats, and
        every stat has to reach <strong>{requiredStat}</strong> before your next level unlocks.
      </p>

      {connection && active ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle)",
              marginBottom: "12px",
            }}
          >
            <span style={{ fontSize: "24px" }}>{active.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "14px" }}>{active.label}</p>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                {connection.lastSyncedAt
                  ? `Last pull ${new Date(connection.lastSyncedAt).toLocaleString()}`
                  : "Never pulled"}
              </p>
            </div>
            <span className="badge badge-teal">Linked</span>
          </div>

          {connection.lastError && (
            <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#ff9f43" }}>
              ⚠️ Last attempt failed: {connection.lastError}
            </p>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            {!active.pushOnly && (
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={sync}
                disabled={busy !== null}
              >
                {busy === "pull" ? "Pulling..." : "⬇️ Pull My Workouts"}
              </button>
            )}
            <button
              className="btn btn-secondary"
              style={{ flex: active.pushOnly ? 1 : "0 0 auto" }}
              onClick={disconnect}
              disabled={busy !== null}
            >
              Unlink
            </button>
          </div>

          {active.pushOnly && (
            <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
              {active.label} sessions arrive from the companion app — there is nothing to pull here.
            </p>
          )}

          {pull && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                borderRadius: "12px",
                background: "rgba(0,212,170,0.08)",
                border: "1px solid rgba(0,212,170,0.3)",
              }}
            >
              <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700 }}>
                {pull.counted > 0
                  ? `${pull.counted} session${pull.counted === 1 ? "" : "s"} counted · +${gained} stat points`
                  : pull.imported > 0
                  ? `${pull.imported} session${pull.imported === 1 ? "" : "s"} imported, none qualified`
                  : "Nothing new since your last pull"}
              </p>
              {pull.stats && (
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {STAT_LABELS.map(([key, label, color]) => (
                    <div key={key} style={{ fontSize: "13px" }}>
                      <span style={{ color, fontWeight: 700 }}>{label} </span>
                      <span>{pull.stats![key]}</span>
                      {pull.totalGain[key] > 0 && (
                        <span style={{ color: "#00d4aa" }}> +{pull.totalGain[key]}</span>
                      )}
                      <span style={{ color: "var(--text-muted)" }}> / {pull.requiredStat}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {providers.map((p) => (
            <button
              key={p.id}
              className="btn btn-secondary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                textAlign: "left",
                opacity: p.configured ? 1 : 0.45,
                cursor: p.configured ? "pointer" : "not-allowed",
              }}
              onClick={() => p.configured && connect(p.id)}
              disabled={!p.configured || busy !== null}
            >
              <span style={{ fontSize: "20px" }}>{p.icon}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: "13px" }}>{p.label}</span>
                <span style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)" }}>
                  {p.configured ? p.blurb : "Not configured on this deployment"}
                </span>
              </span>
              {busy === p.id && <span style={{ fontSize: "12px" }}>...</span>}
            </button>
          ))}
        </div>
      )}

      {(message ?? callbackNotice) && (
        <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
          {message ?? callbackNotice}
        </p>
      )}
    </div>
  );
}
