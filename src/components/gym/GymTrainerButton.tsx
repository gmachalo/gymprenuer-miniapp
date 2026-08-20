"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  gymId: string;
  requiredLevel: number;
  playerLevel: number;
}

export default function GymTrainerButton({ gymId, requiredLevel, playerLevel }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const eligible = playerLevel >= requiredLevel;

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
          ? "Applying..."
          : eligible
          ? "🎓 Become a Trainer"
          : `Need level ${requiredLevel} to train here (you're ${playerLevel})`}
      </button>
      {error && (
        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#f87171" }}>⚠️ {error}</p>
      )}
    </div>
  );
}
