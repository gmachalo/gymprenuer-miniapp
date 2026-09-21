"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  gymId: string;
  requiredLevel: number;
  playerLevel: number;
  isPro: boolean;
  activationCost: number;
  playerXp: number;
}

export default function GymTrainerButton({ gymId, requiredLevel, playerLevel, isPro, activationCost, playerXp }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const levelMet = playerLevel >= requiredLevel;
  const xpMet = playerXp >= activationCost;
  const eligible = levelMet && isPro && xpMet;

  const handleApply = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/game/gyms/${gymId}/trainer`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        router.refresh();
      } else {
        setError(data.error ?? "Failed to apply as trainer");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        id={`trainer-apply-${gymId}`}
        className="btn btn-secondary"
        style={{ width: "100%" }}
        onClick={handleApply}
        disabled={loading || !eligible}
      >
        {loading
          ? "Activating..."
          : eligible
          ? `🎓 Activate Trainer Mode (${activationCost} XP)`
          : !levelMet && !isPro
          ? `Need level ${requiredLevel} + Pro (Advanced) stage to train here`
          : !levelMet
          ? `Need level ${requiredLevel} to train here (you're ${playerLevel})`
          : !isPro
          ? `Need to reach Pro (Advanced) stage to train here`
          : `Need ${activationCost} XP to activate trainer mode (you have ${playerXp})`}
      </button>
      {error && (
        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#f87171" }}>⚠️ {error}</p>
      )}
    </div>
  );
}
