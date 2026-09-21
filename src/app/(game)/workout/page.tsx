"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const PLANS = [
  {
    id: "plan-strength",
    name: "Iron Foundations",
    type: "STRENGTH",
    icon: "🏋️",
    desc: "Compound lifts · Max strength gains",
    color: "#ff4d6d",
  },
  {
    id: "plan-fatloss",
    name: "Lean Machine",
    type: "FAT_LOSS",
    icon: "🔥",
    desc: "HIIT + cardio · Burn fat fast",
    color: "#ff6b35",
  },
  {
    id: "plan-hybrid",
    name: "Athlete Protocol",
    type: "HYBRID",
    icon: "⚡",
    desc: "Strength + conditioning · Balanced",
    color: "#6c47ff",
  },
  {
    id: "plan-calisthenics",
    name: "Body Control",
    type: "CALISTHENICS",
    icon: "🤸",
    desc: "Bodyweight mastery · No equipment",
    color: "#00d4aa",
  },
];

type Intensity = "LOW" | "MEDIUM" | "HIGH";
type Phase = "select" | "active" | "complete";

export default function WorkoutPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("select");
  const [selectedPlan, setSelectedPlan] = useState<(typeof PLANS)[0] | null>(null);
  const [intensity, setIntensity] = useState<Intensity>("MEDIUM");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{
    reward: { totalTokens: string; fitnessBoostApplied: number; cappedByDailyLimit: boolean };
    statGain: Record<string, number> | null;
    newStreak: number;
    xpCost: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === "active") {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [phase]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const circumference = 2 * Math.PI * 54;
  const maxSecs = 3600; // 60 min ring
  const dashOffset = circumference - (elapsed / maxSecs) * circumference;

  const handleFinish = async () => {
    if (!selectedPlan) return;
    const durationMins = Math.max(1, Math.floor(elapsed / 60));
    setLoading(true);
    try {
      const res = await fetch("/api/game/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan.id,
          durationMins,
          intensity,
          adherencePct: 85,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setPhase("complete");
      } else {
        alert(data.error ?? "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Phase: Select Plan ──────────────────────────────────────────────────────
  if (phase === "select") {
    return (
      <div>
        <header className="top-header">
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>
            💪 Start Workout
          </h1>
        </header>

        <div className="container" style={{ paddingTop: "24px" }}>
          <p className="section-title">Choose Your Plan</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
            {PLANS.map((p) => (
              <button
                key={p.id}
                id={`plan-${p.type.toLowerCase()}`}
                onClick={() => setSelectedPlan(p)}
                style={{
                  background:
                    selectedPlan?.id === p.id
                      ? `linear-gradient(135deg, ${p.color}22, ${p.color}08)`
                      : "var(--bg-card)",
                  border: `2px solid ${selectedPlan?.id === p.id ? p.color : "var(--border-subtle)"}`,
                  borderRadius: "14px",
                  padding: "16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  color: "var(--text-primary)",
                  textAlign: "left",
                  transition: "all 0.2s",
                  boxShadow: selectedPlan?.id === p.id ? `0 0 0 3px ${p.color}22` : "none",
                }}
              >
                <span style={{ fontSize: "32px" }}>{p.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "16px" }}>{p.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
                    {p.desc}
                  </p>
                </div>
                {selectedPlan?.id === p.id && (
                  <span style={{ fontSize: "20px" }}>✓</span>
                )}
              </button>
            ))}
          </div>

          <p className="section-title">Intensity</p>
          <div style={{ display: "flex", gap: "10px", marginBottom: "32px" }}>
            {(["LOW", "MEDIUM", "HIGH"] as Intensity[]).map((lvl) => (
              <button
                key={lvl}
                id={`intensity-${lvl.toLowerCase()}`}
                onClick={() => setIntensity(lvl)}
                className={`btn btn-secondary btn-sm`}
                style={{
                  flex: 1,
                  background: intensity === lvl ? "rgba(108,71,255,0.2)" : undefined,
                  borderColor: intensity === lvl ? "var(--brand-primary)" : undefined,
                  color: intensity === lvl ? "var(--brand-primary)" : undefined,
                }}
              >
                {lvl === "LOW" ? "😴 Easy" : lvl === "MEDIUM" ? "⚡ Medium" : "🔥 Hard"}
              </button>
            ))}
          </div>

          <button
            id="start-workout"
            className="btn btn-primary btn-lg"
            style={{ width: "100%" }}
            disabled={!selectedPlan}
            onClick={() => { setElapsed(0); setPhase("active"); }}
          >
            Start Training
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: Active Workout ───────────────────────────────────────────────────
  if (phase === "active") {
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
        <p style={{ color: "var(--text-secondary)", marginBottom: "8px", fontSize: "14px" }}>
          {selectedPlan?.icon} {selectedPlan?.name}
        </p>

        {/* Timer ring */}
        <div className="workout-ring" style={{ marginBottom: "32px" }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="54" fill="none" stroke="var(--bg-elevated)" strokeWidth="10" />
            <circle
              cx="70" cy="70" r="54"
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="ring-progress"
            />
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6c47ff" />
                <stop offset="100%" stopColor="#00d4aa" />
              </linearGradient>
            </defs>
          </svg>
          <div
            style={{
              position: "absolute",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: 800,
                fontFamily: "Space Grotesk, monospace",
              }}
            >
              {formatTime(elapsed)}
            </p>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
              {intensity}
            </p>
          </div>
        </div>

        {/* Motivational text */}
        <div className="glass" style={{ padding: "16px 24px", textAlign: "center", marginBottom: "32px" }}>
          <p style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
            {elapsed < 60 ? "🏁 Getting warmed up..." :
             elapsed < 300 ? "🔥 Keep it going!" :
             elapsed < 900 ? "💪 You're in the zone!" :
             elapsed < 1800 ? "⚡ Crushing it!" :
             "🏆 Elite performance!"}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            {Math.floor(elapsed / 60) < 15
              ? `${15 - Math.floor(elapsed / 60)} min until rewards kick in`
              : "Earning rewards ✓"}
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", width: "100%", maxWidth: "360px" }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => { setPhase("select"); setElapsed(0); }}
          >
            Cancel
          </button>
          <button
            id="finish-workout"
            className="btn btn-accent"
            style={{ flex: 2 }}
            onClick={handleFinish}
            disabled={loading || elapsed < 60}
          >
            {loading ? "Saving..." : "Finish 🏁"}
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: Complete ─────────────────────────────────────────────────────────
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
      <div style={{ fontSize: "64px", marginBottom: "16px", filter: "drop-shadow(0 0 20px gold)" }}>
        🏆
      </div>
      <h1 style={{ margin: "0 0 8px", fontSize: "28px", fontWeight: 900 }} className="gradient-text">
        Workout Complete!
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "32px" }}>
        {Math.floor(elapsed / 60)} minutes · {intensity}
      </p>

      {result && (
        <div className="glass" style={{ width: "100%", maxWidth: "360px", padding: "24px", marginBottom: "24px" }}>
          {/* Tokens */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              paddingBottom: "16px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span style={{ color: "var(--text-secondary)" }}>GYMFIT Earned</span>
            <span
              style={{ fontSize: "24px", fontWeight: 800 }}
              className="gradient-text-gold"
            >
              +{result.reward.totalTokens.toString()}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>XP Spent</span>
            <span style={{ fontWeight: 700, color: "#f87171" }}>-{result.xpCost} XP</span>
          </div>

          {result.reward.fitnessBoostApplied > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Fitness Boost</span>
              <span className="badge badge-teal">
                +{Math.round(result.reward.fitnessBoostApplied * 100)}%
              </span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Streak</span>
            <span style={{ fontWeight: 700 }}>
              🔥 {result.newStreak} {result.newStreak === 1 ? "day" : "days"}
            </span>
          </div>

          {result.reward.cappedByDailyLimit && (
            <div
              className="badge badge-orange"
              style={{ width: "100%", justifyContent: "center", marginTop: "8px" }}
            >
              ⚠️ Daily reward cap reached
            </div>
          )}

          {/* Stat gains */}
          {result.statGain && Object.entries(result.statGain).some(([, v]) => (v as number) > 0) && (
            <div
              style={{
                marginTop: "16px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                Stat Gains
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {Object.entries(result.statGain).map(([stat, val]) =>
                  (val as number) > 0 ? (
                    <span key={stat} className="badge badge-purple">
                      {stat.slice(0, 3).toUpperCase()} +{val as number}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", width: "100%", maxWidth: "360px" }}>
        <button
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={() => { setPhase("select"); setElapsed(0); setResult(null); }}
        >
          Train Again
        </button>
        <button
          id="go-dashboard"
          className="btn btn-primary"
          style={{ flex: 2 }}
          onClick={() => router.push("/dashboard")}
        >
          Dashboard →
        </button>
      </div>
    </div>
  );
}
