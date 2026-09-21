"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  gymId: string;
  gymName: string;
  joinCost: number;
  joinCostLabel: "XP" | "GYMFIT";
  isMember: boolean;
  canAfford: boolean;
  isFull: boolean;
  /** Minimum player level this gym tier admits. */
  requiredLevel: number;
  playerLevel: number;
  /** Equipment grade this membership buys — home training is grade 1. */
  equipmentGrade: number;
  /** The gym they train at now, if any — joining here leaves it. */
  currentGymName?: string | null;
}

export default function GymJoinButton({
  gymId,
  gymName,
  joinCost,
  joinCostLabel,
  isMember,
  canAfford,
  isFull,
  requiredLevel,
  playerLevel,
  equipmentGrade,
  currentGymName,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(isMember);
  const [error, setError] = useState<string | null>(null);
  const meetsLevel = playerLevel >= requiredLevel;

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/game/gyms/${gymId}/join`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setJoined(true);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to join gym");
      }
    } finally {
      setLoading(false);
    }
  };

  // Members can walk away whenever they like and drop back to training at home.
  const handleLeave = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/game/gyms/${gymId}/join`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setJoined(false);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to leave gym");
      }
    } finally {
      setLoading(false);
    }
  };

  if (joined) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span className="badge badge-teal" style={{ fontSize: "14px", padding: "10px 20px" }}>
            ✓ Training at {gymName} · grade {equipmentGrade} equipment
          </span>
          <button
            id={`leave-gym-${gymId}`}
            className="btn btn-secondary"
            style={{ fontSize: "13px", padding: "8px 14px" }}
            onClick={handleLeave}
            disabled={loading}
          >
            {loading ? "Leaving..." : "Leave gym"}
          </button>
        </div>
        {error && <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#ff4d6d" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        id={`join-gym-${gymId}`}
        className="btn btn-accent"
        style={{ width: "100%" }}
        onClick={handleJoin}
        disabled={loading || !canAfford || isFull || !meetsLevel}
      >
        {loading
          ? "Joining..."
          : isFull
          ? "Gym is Full"
          : !meetsLevel
          ? `🔒 Level ${requiredLevel} required — you are ${playerLevel}`
          : !canAfford
          ? `Need ${joinCost.toLocaleString()} ${joinCostLabel} to join`
          : `Join for ${joinCost.toLocaleString()} ${joinCostLabel} · grade ${equipmentGrade} gear`}
      </button>
      {currentGymName && meetsLevel && (
        <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
          Joining here leaves {currentGymName} — you train at one gym at a time.
        </p>
      )}
      {error && <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#ff4d6d" }}>{error}</p>}
    </div>
  );
}
