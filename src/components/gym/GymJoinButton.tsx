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
}

export default function GymJoinButton({ gymId, gymName, joinCost, joinCostLabel, isMember, canAfford, isFull }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(isMember);

  const handleJoin = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/game/gyms/${gymId}/join`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setJoined(true);
        router.refresh();
      } else {
        alert(data.error ?? "Failed to join gym");
      }
    } finally {
      setLoading(false);
    }
  };

  if (joined) {
    return (
      <div className="badge badge-teal" style={{ fontSize: "14px", padding: "10px 20px", display: "inline-flex" }}>
        ✓ Member of {gymName}
      </div>
    );
  }

  return (
    <button
      id={`join-gym-${gymId}`}
      className="btn btn-accent"
      style={{ width: "100%" }}
      onClick={handleJoin}
      disabled={loading || !canAfford || isFull}
    >
      {loading
        ? "Joining..."
        : isFull
        ? "Gym is Full"
        : !canAfford
        ? `Need ${joinCost.toLocaleString()} ${joinCostLabel} to join`
        : `Join for ${joinCost.toLocaleString()} ${joinCostLabel}`}
    </button>
  );
}
