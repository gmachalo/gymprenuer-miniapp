"use client";

import { useState, useCallback } from "react";
import { CharacterSprite } from "./CharacterSprite";
import { WorkoutSpot } from "./WorkoutSpot";
import { RestModal } from "./RestModal";

interface GameWorldProps {
  character: {
    id: string;
    name: string;
    bodyType: "SKINNY" | "AVERAGE" | "OVERWEIGHT";
    transformationStage: number;
  } | null;
  currentXp: number;
  overflowXp: number;
  restUntil: string | null;
  gymName?: string;
  isHome?: boolean;
  onXpChange: (xp: number, overflow: number, restUntil: string | null) => void;
}

interface WorkoutSpotDef {
  id: string;
  icon: string;
  label: string;
  xpCost: number;
  xpReward: string;
  tokenReward: string;
  intensity: "LOW" | "MEDIUM" | "HIGH";
  top: string;
  left: string;
}

const GYM_SPOTS: WorkoutSpotDef[] = [
  { id: "bench",    icon: "🏋️", label: "Bench Press", xpCost: 10, xpReward: "15",  tokenReward: "8",  intensity: "HIGH",   top: "25%", left: "15%" },
  { id: "treadmill",icon: "🏃", label: "Treadmill",   xpCost: 8,  xpReward: "12",  tokenReward: "5",  intensity: "MEDIUM", top: "25%", left: "50%" },
  { id: "squat",    icon: "🦵", label: "Squat Rack",  xpCost: 12, xpReward: "18",  tokenReward: "10", intensity: "HIGH",   top: "25%", left: "75%" },
  { id: "row",      icon: "💪", label: "Cable Row",   xpCost: 8,  xpReward: "12",  tokenReward: "6",  intensity: "MEDIUM", top: "60%", left: "25%" },
  { id: "bike",     icon: "🚴", label: "Bike",        xpCost: 6,  xpReward: "10",  tokenReward: "4",  intensity: "LOW",    top: "60%", left: "65%" },
];

const HOME_SPOTS: WorkoutSpotDef[] = [
  { id: "yoga",     icon: "🧘", label: "Yoga / Stretch", xpCost: 5, xpReward: "8",  tokenReward: "3", intensity: "LOW",    top: "30%", left: "20%" },
  { id: "pushups",  icon: "💪", label: "Push-ups",       xpCost: 5, xpReward: "8",  tokenReward: "3", intensity: "MEDIUM", top: "30%", left: "60%" },
  { id: "hiit",     icon: "🔥", label: "HIIT",           xpCost: 8, xpReward: "12", tokenReward: "5", intensity: "HIGH",   top: "65%", left: "40%" },
];

const NPC_CONFIGS = [
  { bodyType: "SKINNY"    as const, top: "55%", left: "15%", working: true  },
  { bodyType: "AVERAGE"   as const, top: "55%", left: "75%", working: false },
  { bodyType: "OVERWEIGHT"as const, top: "20%", left: "90%", working: true  },
];

type WorkoutView = "world" | "firstperson";

export function GameWorld({
  character,
  currentXp,
  overflowXp,
  restUntil,
  gymName,
  isHome = false,
  onXpChange,
}: GameWorldProps) {
  const [activeSpot, setActiveSpot] = useState<WorkoutSpotDef | null>(null);
  const [workoutView, setWorkoutView] = useState<WorkoutView>("world");
  const [isWorking, setIsWorking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ xpEarned: number; tokensEarned: string } | null>(null);
  const [showRest, setShowRest] = useState(restUntil ? new Date(restUntil) > new Date() : false);

  const spots = isHome ? HOME_SPOTS : GYM_SPOTS;
  const isResting = restUntil ? new Date(restUntil) > new Date() : false;
  const totalXp = currentXp + overflowXp;

  const handleSpotClick = (spot: WorkoutSpotDef) => {
    if (isResting) { setShowRest(true); return; }
    setResult(null);
    setActiveSpot(spot);
  };

  const handleStartWorkout = useCallback(async () => {
    if (!activeSpot) return;
    setLoading(true);
    setIsWorking(true);
    setWorkoutView("world");
    try {
      const endpoint = isHome ? "/api/game/workout/home" : "/api/game/workout/gym";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intensity: activeSpot.intensity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ xpEarned: data.xpEarned, tokensEarned: data.tokensEarned });
      onXpChange(data.currentXp, data.overflowXp, data.restUntil);
      if (data.restUntil) setShowRest(true);
    } catch (e) {
      console.error("[GameWorld] workout error:", e);
    } finally {
      setLoading(false);
      setTimeout(() => { setIsWorking(false); setActiveSpot(null); }, 2500);
    }
  }, [activeSpot, isHome, onXpChange]);

  const bgGradient = isHome
    ? "linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
    : "linear-gradient(160deg, #0d1117 0%, #1a1a2e 60%, #1e0a3c 100%)";

  return (
    <div style={{ position: "relative", width: "100%", flex: 1, minHeight: "420px" }}>

      {/* ── First-person toggle (only during active workout) ── */}
      {isWorking && (
        <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 20, display: "flex", gap: "6px" }}>
          <button
            onClick={() => setWorkoutView("world")}
            style={{
              fontSize: "11px", padding: "4px 10px", borderRadius: "8px", border: "none", cursor: "pointer",
              background: workoutView === "world" ? "#6c47ff" : "rgba(255,255,255,0.08)",
              color: "#fff", fontWeight: workoutView === "world" ? 700 : 400,
            }}
          >3rd 👁</button>
          <button
            onClick={() => setWorkoutView("firstperson")}
            style={{
              fontSize: "11px", padding: "4px 10px", borderRadius: "8px", border: "none", cursor: "pointer",
              background: workoutView === "firstperson" ? "#6c47ff" : "rgba(255,255,255,0.08)",
              color: "#fff", fontWeight: workoutView === "firstperson" ? 700 : 400,
            }}
          >1st 👤</button>
        </div>
      )}

      {/* ── First-Person View ── */}
      {workoutView === "firstperson" && isWorking && activeSpot && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10, borderRadius: "16px",
          background: "linear-gradient(180deg, #0a0a0a 0%, #1a0a2e 100%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: "16px",
        }}>
          <div style={{ fontSize: "72px", animation: "workout-bounce 0.5s ease-in-out infinite" }}>
            {activeSpot.icon}
          </div>
          <h3 style={{ fontSize: "20px", fontWeight: 800, margin: 0 }}>{activeSpot.label}</h3>

          {/* Simulated heart rate */}
          <div style={{ width: "80%", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span>❤️ Heart Rate</span>
              <span style={{ color: "#ef4444", fontWeight: 700 }}>142 BPM</span>
            </div>
            <div style={{ height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "99px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: "72%", background: "#ef4444", borderRadius: "99px", animation: "hr-pulse 0.8s ease-in-out infinite" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span>🔥 Calories</span>
              <span style={{ color: "#f59e0b", fontWeight: 700 }}>~{activeSpot.intensity === "HIGH" ? "340" : "200"} kcal</span>
            </div>
          </div>

          <div style={{ fontSize: "13px", color: "var(--text-muted)", animation: "blink 1s step-end infinite" }}>
            Keep going... 💪
          </div>
        </div>
      )}

      {/* ── 3rd Person World View ── */}
      {workoutView === "world" && (
        <div style={{
          position: "relative", width: "100%", height: "100%", minHeight: "420px",
          background: bgGradient,
          borderRadius: "16px", overflow: "hidden",
          border: "1px solid var(--border-subtle)",
        }}>
          {/* Room label */}
          <div style={{
            position: "absolute", top: "10px", left: "12px",
            fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "1px",
          }}>
            {isHome ? "🏠 HOME" : `🏢 ${gymName ?? "GYM"}`}
          </div>

          {/* Floor grid decoration */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
            background: "rgba(255,255,255,0.02)",
            backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }} />

          {/* Workout spots */}
          {spots.map((spot) => (
            <div key={spot.id} style={{ position: "absolute", top: spot.top, left: spot.left, transform: "translate(-50%,-50%)" }}>
              <WorkoutSpot
                id={spot.id}
                icon={spot.icon}
                label={spot.label}
                xpCost={spot.xpCost}
                xpReward={spot.xpReward}
                tokenReward={spot.tokenReward}
                disabled={isResting || totalXp < spot.xpCost}
                disabledReason={isResting ? "Resting" : totalXp < spot.xpCost ? "Low XP" : undefined}
                occupied={isWorking && activeSpot?.id === spot.id}
                onActivate={() => handleSpotClick(spot)}
              />
            </div>
          ))}

          {/* NPC characters */}
          {NPC_CONFIGS.map((npc, i) => (
            <div key={i} style={{ position: "absolute", top: npc.top, left: npc.left, transform: "translate(-50%,-50%)" }}>
              <CharacterSprite bodyType={npc.bodyType} isWorking={npc.working} size={28} />
            </div>
          ))}

          {/* Player character */}
          <div style={{
            position: "absolute",
            top: activeSpot ? activeSpot.top : "80%",
            left: activeSpot ? activeSpot.left : "48%",
            transform: "translate(-50%, -50%)",
            transition: "top 0.6s cubic-bezier(.4,0,.2,1), left 0.6s cubic-bezier(.4,0,.2,1)",
            zIndex: 5,
          }}>
            <CharacterSprite
              bodyType={character?.bodyType ?? "AVERAGE"}
              transformationStage={character?.transformationStage ?? 0}
              isMoving={!!activeSpot && !isWorking}
              isWorking={isWorking}
              isResting={isResting}
              size={42}
              label={character?.name ?? "You"}
              isPlayer
            />
          </div>

          {/* XP reward pop */}
          {result && (
            <div style={{
              position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)",
              textAlign: "center", animation: "reward-float 2.5s ease-out forwards", zIndex: 20,
              pointerEvents: "none",
            }}>
              <div style={{ fontSize: "22px", fontWeight: 900, color: "#a78bfa" }}>+{result.xpEarned} XP</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#00d4aa" }}>+{result.tokensEarned} 🪙</div>
            </div>
          )}
        </div>
      )}

      {/* ── Workout activation modal ── */}
      {activeSpot && !isWorking && (
        <div style={{
          position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)",
          width: "calc(100% - 32px)", maxWidth: "360px", zIndex: 15,
        }}>
          <div className="glass" style={{ padding: "16px", borderRadius: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "28px" }}>{activeSpot.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "15px" }}>{activeSpot.label}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Cost: {activeSpot.xpCost} XP · Reward: +{activeSpot.xpReward} XP · +{activeSpot.tokenReward} 🪙
                  </div>
                </div>
              </div>
              <button onClick={() => setActiveSpot(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "18px" }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleStartWorkout} disabled={loading}>
                {loading ? "Starting..." : "▶ Activate Workout"}
              </button>
              <button
                onClick={() => setWorkoutView("firstperson")}
                style={{ padding: "0 14px", borderRadius: "10px", border: "1px solid var(--border-subtle)", background: "none", cursor: "pointer", fontSize: "18px" }}
                title="First-person view"
              >👤</button>
            </div>
          </div>
        </div>
      )}

      {/* Rest modal */}
      {showRest && restUntil && (
        <RestModal
          restUntil={restUntil}
          overflowXp={overflowXp}
          onSkip={() => setShowRest(false)}
          onDismiss={() => setShowRest(false)}
        />
      )}

      <style>{`
        @keyframes workout-bounce {
          0%, 100% { transform: translateY(0) scaleY(1); }
          40% { transform: translateY(-14px) scaleY(1.1); }
        }
        @keyframes hr-pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.5; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes reward-float {
          0% { opacity: 0; transform: translate(-50%, -30%); }
          20% { opacity: 1; }
          80% { opacity: 1; transform: translate(-50%, -80%); }
          100% { opacity: 0; transform: translate(-50%, -100%); }
        }
      `}</style>
    </div>
  );
}
