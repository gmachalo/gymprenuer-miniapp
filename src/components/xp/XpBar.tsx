"use client";

import { useEffect, useState } from "react";
import { MAX_XP_ACCUMULATION } from "@/lib/game/engine";

interface XpBarProps {
  currentXp: number;        // 0–100
  overflowXp: number;       // extra XP above 100
  restUntil: string | null; // ISO datetime or null
  lastXpRegenAt?: string;   // ISO datetime for local countdown
}

export function XpBar({ currentXp, overflowXp, restUntil, lastXpRegenAt }: XpBarProps) {
  const [nextRegenSecs, setNextRegenSecs] = useState<number>(0);
  const isResting = restUntil ? new Date(restUntil) > new Date() : false;
  const [restSecsLeft, setRestSecsLeft] = useState(0);
  const totalXp = currentXp + overflowXp;

  // Countdown to next regen tick (every 2 min)
  useEffect(() => {
    if (!lastXpRegenAt) return;
    const tick = () => {
      const elapsed = (Date.now() - new Date(lastXpRegenAt).getTime()) / 1000;
      const secsPerXp = 120; // 2 min
      const secsUntilNext = Math.max(0, secsPerXp - (elapsed % secsPerXp));
      setNextRegenSecs(Math.floor(secsUntilNext));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastXpRegenAt]);

  // Rest countdown
  useEffect(() => {
    if (!restUntil) return;
    const tick = () => {
      const secs = Math.max(0, (new Date(restUntil).getTime() - Date.now()) / 1000);
      setRestSecsLeft(Math.floor(secs));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [restUntil]);

  const pct = Math.min(100, (currentXp / 100) * 100);
  const barColor = isResting
    ? "#6b7280"
    : currentXp <= 20
    ? "#ef4444"
    : currentXp <= 50
    ? "#f59e0b"
    : "#6c47ff";

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      style={{
        padding: "8px 14px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}
    >
      {/* Label row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)" }}>
            ⚡ XP
          </span>
          {isResting && (
            <span
              style={{
                fontSize: "10px",
                background: "#374151",
                color: "#9ca3af",
                borderRadius: "4px",
                padding: "1px 6px",
                fontWeight: 700,
              }}
            >
              😴 REST {fmtTime(restSecsLeft)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {currentXp}/100
          </span>
          {overflowXp > 0 && (
            <span
              style={{
                fontSize: "11px",
                background: "rgba(108,71,255,0.2)",
                color: "#a78bfa",
                borderRadius: "6px",
                padding: "1px 7px",
                fontWeight: 700,
              }}
            >
              +{overflowXp}
            </span>
          )}
        </div>
      </div>

      {/* Bar */}
      <div
        style={{
          height: "8px",
          background: "var(--bg-elevated)",
          borderRadius: "99px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: barColor,
            borderRadius: "99px",
            transition: "width 0.6s ease, background 0.3s ease",
            boxShadow: isResting ? "none" : `0 0 8px ${barColor}88`,
          }}
        />
      </div>

      {/* Sub-row */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
          Total: {totalXp}/{MAX_XP_ACCUMULATION} XP
        </span>
        {!isResting && currentXp < 100 && (
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            +1 XP in {fmtTime(nextRegenSecs)}
          </span>
        )}
      </div>
    </div>
  );
}
