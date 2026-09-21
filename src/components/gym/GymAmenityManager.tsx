"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Amenity {
  id?: string;
  type: string;
  name: string;
  kind: "REFRESHMENT" | "HYGIENE" | "STORAGE" | "ROOM";
  icon: string;
  verb: string;
  xpGain: number;
  cooldownMins: number;
  minTier: number;
  installCost: string;
  reputation: number;
  blurb: string;
}

interface Payload {
  tier: number;
  isOwner: boolean;
  capacity: { used: number; total: number; free: number };
  standard: Amenity[];
  installed: Amenity[];
  available: Amenity[];
  lockedByTier: Amenity[];
}

const KIND_LABEL: Record<Amenity["kind"], string> = {
  REFRESHMENT: "Refreshment",
  HYGIENE: "Facility",
  STORAGE: "Facility",
  ROOM: "Room",
};

/** What a piece gives the player, in one phrase. */
function payoff(a: Amenity): string {
  return a.xpGain > 0
    ? `+${a.xpGain} XP every ${a.cooldownMins} min`
    : `+${a.reputation} reputation, no XP`;
}

export default function GymAmenityManager({
  gymId,
  balance,
}: {
  gymId: string;
  balance: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tokens, setTokens] = useState(BigInt(balance));

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/game/gyms/${gymId}/amenities`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled && payload) setData(payload);
      })
      .catch(() => {
        /* leave the panel empty */
      });
    return () => {
      cancelled = true;
    };
  }, [gymId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const install = async (type: string) => {
    setBusy(type);
    setMessage(null);
    try {
      const res = await fetch(`/api/game/gyms/${gymId}/amenities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage(result.error ?? "That did not work");
        return;
      }
      setTokens(BigInt(result.balance));
      setMessage(`${result.amenity.name} installed — ${payoff(result.amenity)}.`);
      reload();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;

  const { capacity } = data;

  const row = (a: Amenity, action?: React.ReactNode, muted = false) => (
    <div key={a.type} className="card" style={{ padding: "12px 16px", opacity: muted ? 0.55 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "24px" }}>{a.icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: "14px" }}>{a.name}</p>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
            {KIND_LABEL[a.kind]} · {payoff(a)}
          </p>
        </div>
        {action}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="section-title" style={{ margin: 0 }}>🛋️ Amenities</p>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          {capacity.used}/{capacity.total} slots · tier {data.tier}
        </span>
      </div>
      <p style={{ margin: "4px 0 12px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
        Amenities hand XP back rather than spending it. Every gym has a dispenser and a shower;
        higher tiers unlock better refreshments, lockers, and dedicated rooms — and hold more at once.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
        {data.standard.map((a) =>
          row(a, <span className="badge badge-teal">Standard</span>)
        )}
        {data.installed.map((a) =>
          row(a, <span className="badge badge-purple">Installed</span>)
        )}
      </div>

      {data.isOwner && data.available.length > 0 && (
        <>
          <p className="section-title" style={{ margin: "0 0 8px" }}>➕ Available to Install</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
            {data.available.map((a) => {
              const cost = BigInt(a.installCost);
              const noRoom = capacity.free <= 0;
              return row(
                a,
                <button
                  className="btn btn-primary"
                  style={{ fontSize: "12px", padding: "8px 12px", whiteSpace: "nowrap" }}
                  disabled={busy !== null || tokens < cost || noRoom}
                  onClick={() => install(a.type)}
                >
                  {busy === a.type
                    ? "..."
                    : noRoom
                    ? "No slots"
                    : `Install · ${a.installCost} 🪙`}
                </button>
              );
            })}
          </div>
          {capacity.free <= 0 && (
            <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#ff9f43" }}>
              All {capacity.total} amenity slots are full. Upgrade the gym for more room.
            </p>
          )}
        </>
      )}

      {data.lockedByTier.length > 0 && (
        <details>
          <summary style={{ fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer" }}>
            🔒 {data.lockedByTier.length} amenities locked behind higher tiers
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            {data.lockedByTier.map((a) => (
              <div
                key={a.type}
                style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)" }}
              >
                <span>
                  {a.icon} {a.name} · {payoff(a)}
                </span>
                <span>needs tier {a.minTier}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {message && (
        <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>{message}</p>
      )}
    </div>
  );
}
