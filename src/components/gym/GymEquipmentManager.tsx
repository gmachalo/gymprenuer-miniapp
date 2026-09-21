"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface OwnedEquipment {
  id: string;
  type: string;
  name: string;
  icon: string;
  level: number;
  capacity: number;
  grade: number;
  tokenYield: number;
  upgradeCost: string | null;
  maxed: boolean;
}

interface AvailableEquipment {
  type: string;
  name: string;
  icon: string;
  grade: number;
  intensity: string;
  planType: string;
  purchaseCost: string;
  tokenYield: number;
}

interface LockedEquipment {
  type: string;
  name: string;
  grade: number;
  requiresGymTier: number;
  purchaseCost: string;
}

interface TierProgress {
  requirement: {
    tier: number;
    minEquipmentCount: number;
    minTotalEquipmentLevels: number;
    requiredTopGrade: number;
    costGymfit: string | number;
  } | null;
  equipmentCount: number;
  totalEquipmentLevels: number;
  missing: string[];
  eligible: boolean;
}

interface Payload {
  tier: number;
  maxGrade: number;
  isOwner: boolean;
  owned: OwnedEquipment[];
  available: AvailableEquipment[];
  lockedByTier: LockedEquipment[];
  tierProgress: TierProgress;
}

const GRADE_LABEL = (grade: number) => `Grade ${grade}`;

export default function GymEquipmentManager({
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
    fetch(`/api/game/gyms/${gymId}/equipment`)
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

  const post = async (key: string, body: object, method: "POST" | "PATCH") => {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(`/api/game/gyms/${gymId}/equipment`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage(result.error ?? "That did not work");
        return;
      }
      if (result.balance) setTokens(BigInt(result.balance));
      setMessage(
        method === "POST"
          ? `Installed ${result.equipment.name} — pays ${result.equipment.tokenYield} GYMFIT per workout.`
          : `${result.equipment.name} is now Lv.${result.equipment.level} — pays ${result.equipment.tokenYield} GYMFIT.`
      );
      reload();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const upgradeGym = async () => {
    setBusy("tier");
    setMessage(null);
    try {
      const res = await fetch(`/api/game/gyms/${gymId}/upgrade`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        setMessage(result.error ?? "Upgrade failed");
        return;
      }
      setTokens(BigInt(result.user.offChainTokens));
      setMessage(
        `${result.gym.name} is now tier ${result.gym.tier} — ${result.newTierName}. Grade ${result.equipmentGrade} equipment unlocked.`
      );
      reload();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;

  const { tierProgress } = data;
  const requirement = tierProgress.requirement;
  const tierCost = requirement ? BigInt(requirement.costGymfit) : 0n;
  const canAffordTier = tokens >= tierCost;

  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="section-title" style={{ margin: 0 }}>🏋️ Equipment Floor</p>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          Tier {data.tier} · up to {GRADE_LABEL(data.maxGrade).toLowerCase()} · {tokens.toString()} 🪙
        </span>
      </div>
      <p style={{ margin: "4px 0 12px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
        Home training is grade 1. This gym hosts up to grade {data.maxGrade}, and every upgrade level
        adds 25% to what a machine pays out.
      </p>

      {/* Installed */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        {data.owned.map((eq) => (
          <div key={eq.id} className="card" style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>{eq.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: "14px" }}>{eq.name}</p>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                  {GRADE_LABEL(eq.grade)} · Lv.{eq.level} · pays {eq.tokenYield} 🪙 · capacity {eq.capacity}
                </p>
              </div>
              {data.isOwner &&
                (eq.maxed ? (
                  <span className="badge badge-gold">MAX</span>
                ) : (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: "12px", padding: "8px 12px", whiteSpace: "nowrap" }}
                    disabled={busy !== null || tokens < BigInt(eq.upgradeCost ?? "0")}
                    onClick={() => post(eq.id, { equipmentId: eq.id }, "PATCH")}
                  >
                    {busy === eq.id ? "..." : `⬆ Lv.${eq.level + 1} · ${eq.upgradeCost} 🪙`}
                  </button>
                ))}
              {!data.isOwner && <span className="badge badge-purple">Lv.{eq.level}</span>}
            </div>
          </div>
        ))}
        {data.owned.length === 0 && (
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
            No equipment installed yet.
          </p>
        )}
      </div>

      {/* Buy */}
      {data.isOwner && data.available.length > 0 && (
        <>
          <p className="section-title" style={{ margin: "0 0 8px" }}>➕ Available to Buy</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            {data.available.map((spec) => {
              const cost = BigInt(spec.purchaseCost);
              return (
                <div key={spec.type} className="card" style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "24px" }}>{spec.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: "14px" }}>{spec.name}</p>
                      <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                        {GRADE_LABEL(spec.grade)} · {spec.intensity.toLowerCase()} · pays {spec.tokenYield} 🪙
                      </p>
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: "12px", padding: "8px 12px", whiteSpace: "nowrap" }}
                      disabled={busy !== null || tokens < cost}
                      onClick={() => post(spec.type, { type: spec.type }, "POST")}
                    >
                      {busy === spec.type ? "..." : `Buy · ${spec.purchaseCost} 🪙`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Tier upgrade */}
      {data.isOwner && requirement && (
        <div
          className="card"
          style={{
            padding: "14px 16px",
            marginBottom: "16px",
            border: `1px solid ${tierProgress.eligible ? "rgba(0,212,170,0.4)" : "var(--border-subtle)"}`,
            background: tierProgress.eligible ? "rgba(0,212,170,0.07)" : "var(--bg-card)",
          }}
        >
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: "14px" }}>
            Upgrade to tier {requirement.tier}
          </p>
          <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Build-out required: {requirement.minEquipmentCount} pieces (have {tierProgress.equipmentCount}),{" "}
            {requirement.minTotalEquipmentLevels} total levels (have {tierProgress.totalEquipmentLevels}),
            and a grade {requirement.requiredTopGrade} machine. Unlocks grade {requirement.tier + 1} equipment.
          </p>
          {tierProgress.missing.length > 0 && (
            <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#ff9f43" }}>
              Still needs: {tierProgress.missing.join(", ")}.
            </p>
          )}
          <button
            className="btn btn-accent"
            style={{ width: "100%" }}
            disabled={busy !== null || !tierProgress.eligible || !canAffordTier}
            onClick={upgradeGym}
          >
            {busy === "tier"
              ? "Upgrading..."
              : !tierProgress.eligible
              ? "🔒 Build out the floor first"
              : !canAffordTier
              ? `🔒 Need ${tierCost.toString()} GYMFIT`
              : `⬆️ Upgrade Gym · ${tierCost.toString()} 🪙`}
          </button>
        </div>
      )}

      {/* Locked — the pull to tier up */}
      {data.lockedByTier.length > 0 && (
        <details>
          <summary style={{ fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer" }}>
            🔒 {data.lockedByTier.length} machines locked behind higher tiers
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            {data.lockedByTier.map((spec) => (
              <div
                key={spec.type}
                style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)" }}
              >
                <span>
                  {spec.name} · {GRADE_LABEL(spec.grade)}
                </span>
                <span>needs tier {spec.requiresGymTier}</span>
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
