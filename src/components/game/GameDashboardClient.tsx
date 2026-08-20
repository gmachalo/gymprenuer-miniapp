"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GameWorld } from "@/components/game/GameWorld";
import { XpBar } from "@/components/xp/XpBar";
import { useXpRegen } from "@/hooks/useXpRegen";

interface GameDashboardClientProps {
  character: {
    id: string;
    name: string;
    bodyType: "SKINNY" | "AVERAGE" | "OVERWEIGHT";
    transformationStage: number;
  } | null;
  initialXp: number;
  initialOverflow: number;
  initialRestUntil: string | null;
  initialLastRegenAt: string;
  gymName?: string;
  hasGym: boolean;
}

export function GameDashboardClient({
  character,
  initialXp,
  initialOverflow,
  initialRestUntil,
  initialLastRegenAt,
  gymName,
  hasGym,
}: GameDashboardClientProps) {
  const [currentXp, setCurrentXp] = useState(initialXp);
  const [overflowXp, setOverflowXp] = useState(initialOverflow);
  const [restUntil, setRestUntil] = useState<string | null>(initialRestUntil);
  const [lastRegenAt, setLastRegenAt] = useState(initialLastRegenAt);
  const [worldMode, setWorldMode] = useState<"home" | "gym">(hasGym ? "gym" : "home");
  const router = useRouter();

  const handleRegenSync = useCallback(
    (data: { currentXp: number; overflowXp: number; restUntil: string | null }) => {
      setCurrentXp(data.currentXp);
      setOverflowXp(data.overflowXp);
      setRestUntil(data.restUntil);
      setLastRegenAt(new Date().toISOString());
    },
    []
  );

  const handleXpChange = useCallback(
    (xp: number, overflow: number, rest: string | null) => {
      setCurrentXp(xp);
      setOverflowXp(overflow);
      setRestUntil(rest);
      // The dashboard's totalXp/level/recent-workouts are server-rendered —
      // refresh so they pick up the workout that just completed instead of
      // only updating this component's local XP bar.
      router.refresh();
    },
    [router]
  );

  useXpRegen(handleRegenSync);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* XP Bar */}
      <XpBar
        currentXp={currentXp}
        overflowXp={overflowXp}
        restUntil={restUntil}
        lastXpRegenAt={lastRegenAt}
      />

      {/* World mode toggle */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "4px",
          background: "var(--bg-elevated)",
          borderRadius: "10px",
        }}
      >
        <button
          onClick={() => setWorldMode("home")}
          style={{
            flex: 1,
            padding: "7px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: worldMode === "home" ? 700 : 400,
            background: worldMode === "home" ? "var(--bg-card)" : "transparent",
            color: worldMode === "home" ? "var(--text-primary)" : "var(--text-muted)",
            transition: "all 0.15s ease",
          }}
        >
          🏠 Home
        </button>
        {hasGym && (
          <button
            onClick={() => setWorldMode("gym")}
            style={{
              flex: 1,
              padding: "7px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: worldMode === "gym" ? 700 : 400,
              background: worldMode === "gym" ? "var(--bg-card)" : "transparent",
              color: worldMode === "gym" ? "var(--text-primary)" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            🏢 {gymName ?? "Gym"}
          </button>
        )}
        {!hasGym && (
          <a
            href="/gyms"
            style={{
              flex: 1,
              padding: "7px",
              borderRadius: "8px",
              border: "1px dashed var(--border-subtle)",
              textAlign: "center",
              fontSize: "12px",
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            + Join a Gym
          </a>
        )}
      </div>

      {/* Game World */}
      <GameWorld
        character={character}
        currentXp={currentXp}
        overflowXp={overflowXp}
        restUntil={restUntil}
        gymName={gymName}
        isHome={worldMode === "home"}
        onXpChange={handleXpChange}
      />
    </div>
  );
}
