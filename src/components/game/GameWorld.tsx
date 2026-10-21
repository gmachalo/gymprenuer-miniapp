"use client";

import { useState, useCallback, useMemo } from "react";
import { CharacterSprite } from "./CharacterSprite";
import { WorkoutSpot } from "./WorkoutSpot";
import {
  equipmentAvailableForTier,
  equipmentSpec,
  equipmentTokenYield,
  homeEquipment,
  amenitySpec,
  standardAmenities,
  floorOrder,
  workoutXpCost,
} from "@/lib/game/engine";
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
  /** Equipment installed at the player's gym — drives the gym tiles. */
  gymEquipment?: InstalledEquipment[];
  /** Amenity catalog keys the gym has bought; standard fittings are implicit. */
  gymAmenities?: string[];
  /** The player's level — workouts cost more as it rises. */
  playerLevel?: number;
  onXpChange: (xp: number, overflow: number, restUntil: string | null) => void;
}

interface WorkoutSpotDef {
  id: string;
  icon: string;
  label: string;
  xpCost: number;
  tokenReward: string;
  intensity: "LOW" | "MEDIUM" | "HIGH";
  level: number;
  grade: number;
  top: string;
  left: string;
}

/** A piece of equipment actually installed at the player's gym. */
export interface InstalledEquipment {
  type: string;
  name: string;
  level: number;
}

// ─── Floor layout ────────────────────────────────────────────────────────────
// Rows are positioned in pixels rather than percentages: a tile is a fixed
// ~110px tall, so percentage rows overlap as soon as the card is short, and the
// last row falls off the bottom. The card grows to fit however many rows the
// gym needs instead.
const SPOT_PER_ROW = 3;          // 3 across stays readable at phone width
const SPOT_ROW_HEIGHT = 118;     // tile (72) + its two label lines + breathing room
const SPOT_GRID_TOP = 84;        // clears the room label and the amenity strip
const PLAYER_BAND = 74;          // space under the grid for the player and NPCs

/** Column centres for a row holding `n` tiles — a short final row is centred. */
function rowColumns(n: number): string[] {
  if (n <= 1) return ["50%"];
  if (n === 2) return ["31%", "69%"];
  return ["19%", "50%", "81%"];
}

function spotLayout(count: number) {
  const rows = Math.max(1, Math.ceil(count / SPOT_PER_ROW));
  return {
    rows,
    /** Height the card needs so nothing overlaps or clips. */
    minHeight: SPOT_GRID_TOP + rows * SPOT_ROW_HEIGHT + PLAYER_BAND,
    /** Where the player and NPCs stand, clear of the last row. */
    playerTop: SPOT_GRID_TOP + rows * SPOT_ROW_HEIGHT + PLAYER_BAND / 2,
    position(index: number): { top: string; left: string } {
      const row = Math.floor(index / SPOT_PER_ROW);
      const inRow = Math.min(SPOT_PER_ROW, count - row * SPOT_PER_ROW);
      const columns = rowColumns(inRow);
      return {
        top: `${SPOT_GRID_TOP + row * SPOT_ROW_HEIGHT}px`,
        left: columns[index % SPOT_PER_ROW],
      };
    },
  };
}

/**
 * Build the tiles from the equipment catalog — the same source the game world
 * and the server payout read — so what is shown here is exactly what the player
 * will find on the floor, at the level the gym owner has upgraded it to.
 */
function buildSpots(isHome: boolean, level: number, installed?: InstalledEquipment[]): WorkoutSpotDef[] {
  // Rows the catalog does not recognise cannot be rendered or priced, so they
  // are dropped before deciding whether the gym has a floor of its own.
  const known = (installed ?? []).filter((piece) => !!equipmentSpec(piece.type));

  const pieces: InstalledEquipment[] = isHome
    ? homeEquipment().map((spec) => ({ type: spec.type, name: spec.name, level: 1 }))
    : known.length > 0
    ? known
    : equipmentAvailableForTier(1).map((spec) => ({ type: spec.type, name: spec.name, level: 1 }));

  const layout = spotLayout(pieces.length);
  // Same order as the game world's floor: strength first, cardio last.
  return floorOrder(pieces).map((piece, index) => {
    const spec = equipmentSpec(piece.type)!;
    return {
      id: spec.type,
      icon: spec.icon,
      label: piece.name || spec.name,
      // Same scaled cost the server charges at this level.
      xpCost: workoutXpCost(spec.xpCost, level),
      tokenReward: String(equipmentTokenYield(spec, piece.level)),
      intensity: spec.intensity,
      level: piece.level,
      grade: spec.grade,
      ...layout.position(index),
    };
  });
}

/**
 * Amenities shown alongside the gym floor — the standard dispenser and shower
 * plus whatever the owner has installed. Resolved from the same catalog the
 * game world uses, so the two views never disagree.
 */
function buildAmenities(installed?: string[]) {
  const types = [
    ...standardAmenities().map((spec) => spec.type),
    ...(installed ?? []).filter((type) => {
      const spec = amenitySpec(type);
      return !!spec && !spec.standard;
    }),
  ];
  return types.flatMap((type) => {
    const spec = amenitySpec(type);
    if (!spec || spec.xpGain <= 0) return [];
    return [{
      type: spec.type,
      name: spec.name,
      icon: spec.icon,
      verb: spec.verb,
      xpGain: spec.xpGain,
    }];
  });
}

// NPCs share the player's band at the foot of the floor, well clear of the tiles.
const NPC_CONFIGS = [
  { bodyType: "SKINNY"     as const, left: "12%", working: true  },
  { bodyType: "AVERAGE"    as const, left: "30%", working: false },
  { bodyType: "OVERWEIGHT" as const, left: "88%", working: true  },
];

type WorkoutView = "world" | "firstperson";

export function GameWorld({
  character,
  currentXp,
  overflowXp,
  restUntil,
  gymName,
  isHome = false,
  gymEquipment,
  gymAmenities,
  playerLevel = 1,
  onXpChange,
}: GameWorldProps) {
  const [activeSpot, setActiveSpot] = useState<WorkoutSpotDef | null>(null);
  const [workoutView, setWorkoutView] = useState<WorkoutView>("world");
  const [isWorking, setIsWorking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ xpSpent: number; tokensEarned: string } | null>(null);
  const [showRest, setShowRest] = useState(restUntil ? new Date(restUntil) > new Date() : false);
  const [error, setError] = useState<string | null>(null);

  const spots = useMemo(() => buildSpots(isHome, playerLevel, gymEquipment), [isHome, playerLevel, gymEquipment]);
  const layout = useMemo(() => spotLayout(spots.length), [spots.length]);
  // Amenities belong to the gym, so the strip is hidden at home.
  const amenities = useMemo(
    () => (isHome ? [] : buildAmenities(gymAmenities)),
    [isHome, gymAmenities]
  );
  const [amenityBusy, setAmenityBusy] = useState<string | null>(null);
  const [amenityNote, setAmenityNote] = useState<string | null>(null);

  const redeemAmenity = useCallback(
    async (type: string, name: string) => {
      setAmenityBusy(type);
      setAmenityNote(null);
      try {
        const res = await fetch("/api/game/gym/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amenity: type }),
        });
        const data = await res.json();
        if (res.ok) {
          setAmenityNote(`${name}: +${data.xpGained} XP`);
          onXpChange(data.currentXp, data.overflowXp, data.restUntil ?? null);
        } else {
          setAmenityNote(data.error ?? "Can't use that yet");
        }
      } catch {
        setAmenityNote("Can't use that right now");
      } finally {
        setAmenityBusy(null);
        setTimeout(() => setAmenityNote(null), 3500);
      }
    },
    [onXpChange]
  );
  const isResting = restUntil ? new Date(restUntil) > new Date() : false;
  const totalXp = currentXp + overflowXp;

  const handleSpotClick = (spot: WorkoutSpotDef) => {
    if (isResting) { setShowRest(true); return; }
    setResult(null);
    setError(null);
    setActiveSpot(spot);
  };

  const handleStartWorkout = useCallback(async () => {
    if (!activeSpot) return;
    setLoading(true);
    setIsWorking(true);
    setWorkoutView("world");
    setError(null);
    try {
      const endpoint = isHome ? "/api/game/workout/home" : "/api/game/workout/gym";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intensity: activeSpot.intensity,
          equipmentId: activeSpot.id,
          xpCost: activeSpot.xpCost,
          tokensEarned: Number(activeSpot.tokenReward),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Workout failed");
      setResult({ xpSpent: data.xpSpent, tokensEarned: data.tokensEarned });
      onXpChange(data.currentXp, data.overflowXp, data.restUntil);
      if (data.restUntil) setShowRest(true);
    } catch (e) {
      console.error("[GameWorld] workout error:", e);
      setError(e instanceof Error ? e.message : "Workout failed");
    } finally {
      setLoading(false);
      setTimeout(() => { setIsWorking(false); setActiveSpot(null); }, 2500);
    }
  }, [activeSpot, isHome, onXpChange]);

  const bgGradient = isHome
    ? "linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
    : "linear-gradient(160deg, #0d1117 0%, #1a1a2e 60%, #1e0a3c 100%)";

  return (
    <div style={{ position: "relative", width: "100%", flex: 1, minHeight: `${layout.minHeight}px` }}>

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
          position: "relative", width: "100%", height: "100%",
          minHeight: `${layout.minHeight}px`,
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

          {/* Amenities — tap to take XP back, mirroring the game world */}
          {amenities.length > 0 && (
            <div style={{
              position: "absolute", top: "8px", right: "10px",
              display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end",
              maxWidth: "60%",
            }}>
              {amenities.map((a) => (
                <button
                  key={a.type}
                  title={`${a.verb} · +${a.xpGain} XP`}
                  onClick={() => redeemAmenity(a.type, a.name)}
                  disabled={amenityBusy !== null}
                  style={{
                    display: "flex", alignItems: "center", gap: "3px",
                    padding: "4px 7px", borderRadius: "999px",
                    border: "1px solid rgba(0,212,170,0.35)",
                    background: "rgba(0,212,170,0.10)",
                    color: "var(--text-secondary)", fontSize: "11px",
                    cursor: amenityBusy ? "wait" : "pointer",
                  }}
                >
                  <span style={{ fontSize: "13px" }}>{a.icon}</span>
                  <span style={{ color: "#00d4aa", fontWeight: 700 }}>+{a.xpGain}</span>
                </button>
              ))}
            </div>
          )}
          {amenityNote && (
            <div style={{
              position: "absolute", top: "42px", right: "10px",
              fontSize: "11px", color: "var(--text-secondary)",
              background: "rgba(0,0,0,0.55)", padding: "3px 8px", borderRadius: "8px",
            }}>
              {amenityNote}
            </div>
          )}

          {/* Workout spots */}
          {spots.map((spot) => (
            <div key={spot.id} style={{ position: "absolute", top: spot.top, left: spot.left, transform: "translate(-50%,-50%)" }}>
              <WorkoutSpot
                id={spot.id}
                icon={spot.icon}
                label={spot.label}
                xpCost={spot.xpCost}
                tokenReward={spot.tokenReward}
                disabled={isResting || totalXp < spot.xpCost}
                disabledReason={isResting ? "Resting" : totalXp < spot.xpCost ? "Low XP" : undefined}
                level={spot.level}
                grade={spot.grade}
                occupied={isWorking && activeSpot?.id === spot.id}
                onActivate={() => handleSpotClick(spot)}
              />
            </div>
          ))}

          {/* NPC characters */}
          {NPC_CONFIGS.map((npc, i) => (
            <div key={i} style={{ position: "absolute", top: `${layout.playerTop}px`, left: npc.left, transform: "translate(-50%,-50%)" }}>
              <CharacterSprite bodyType={npc.bodyType} isWorking={npc.working} size={28} />
            </div>
          ))}

          {/* Player character */}
          <div style={{
            position: "absolute",
            top: activeSpot ? activeSpot.top : `${layout.playerTop}px`,
            left: activeSpot ? activeSpot.left : "50%",
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

          {/* Workout result pop */}
          {result && (
            <div style={{
              position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)",
              textAlign: "center", animation: "reward-float 2.5s ease-out forwards", zIndex: 20,
              pointerEvents: "none",
            }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#f87171" }}>-{result.xpSpent} XP</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#00d4aa" }}>+{result.tokensEarned} 🪙</div>
            </div>
          )}

          {/* Workout error */}
          {error && (
            <div style={{
              position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)",
              textAlign: "center", animation: "reward-float 2.5s ease-out forwards", zIndex: 20,
              pointerEvents: "none", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: "10px", padding: "8px 14px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#f87171" }}>⚠️ {error}</div>
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
                    Costs {activeSpot.xpCost} XP · Earns +{activeSpot.tokenReward} 🪙
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
