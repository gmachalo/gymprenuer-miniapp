"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BODY_TYPE_BASE_STATS, startingStatsFor, STAT_PER_LEVEL } from "@/lib/game/engine";

// ─── Data ───────────────────────────────────────────────────────────────────

const BODY_TYPES = [
  {
    type: "SKINNY",
    emoji: "🦴",
    label: "Lean",
    desc: "High metabolism. Low strength but fast stamina gains.",
    stats: BODY_TYPE_BASE_STATS.SKINNY,
    color: "#4cc9f0",
  },
  {
    type: "AVERAGE",
    emoji: "🧑",
    label: "Average",
    desc: "Balanced starting stats. Most flexible build.",
    stats: BODY_TYPE_BASE_STATS.AVERAGE,
    color: "#6c47ff",
  },
  {
    type: "OVERWEIGHT",
    emoji: "🐻",
    label: "Bulky",
    desc: "High strength base. Slow metabolism but powerful.",
    stats: BODY_TYPE_BASE_STATS.OVERWEIGHT,
    color: "#ff6b35",
  },
  {
    // Pseudo-type resolved at submit time
    type: "RANDOM",
    emoji: "🎲",
    label: "Random",
    desc: "Let the game decide. Surprise yourself!",
    stats: { strength: 0, stamina: 0, discipline: 0, metabolism: 0 },
    color: "#f72585",
  },
];

const REAL_BODY_TYPES = ["SKINNY", "AVERAGE", "OVERWEIGHT"] as const;

const STAT_LABELS = [
  ["strength", "STR"],
  ["stamina", "STA"],
  ["discipline", "DIS"],
  ["metabolism", "MET"],
] as const;

const WORKOUT_PLANS = [
  {
    id: "strength",
    name: "Iron Foundations",
    type: "STRENGTH",
    icon: "🏋️",
    desc: "Compound lifts. Maximum strength gains.",
    color: "#ff4d6d",
  },
  {
    id: "fatloss",
    name: "Lean Machine",
    type: "FAT_LOSS",
    icon: "🔥",
    desc: "HIIT + cardio. Burn fat fast.",
    color: "#ff6b35",
  },
  {
    id: "hybrid",
    name: "Athlete Protocol",
    type: "HYBRID",
    icon: "⚡",
    desc: "Strength + conditioning. Balanced gains.",
    color: "#6c47ff",
  },
  {
    id: "calisthenics",
    name: "Body Control",
    type: "CALISTHENICS",
    icon: "🤸",
    desc: "Bodyweight mastery. No equipment needed.",
    color: "#00d4aa",
  },
];

const GAME_MODES = [
  {
    mode: "SOLO",
    emoji: "🏃",
    label: "Solo",
    desc: "Personal journey. Compete on global leaderboards.",
    features: ["Personal rewards", "Global leaderboards", "Character ownership"],
  },
  {
    mode: "SOCIAL",
    emoji: "👥",
    label: "Social",
    desc: "Join friends. Build gyms together. Earn passive income.",
    features: ["Gym co-ownership", "Friend challenges", "Profit sharing"],
  },
];

const STEPS = ["Welcome", "Body Type", "Character", "Goals", "Mode", "Done"];
const STORAGE_KEY = "gymprenuer_onboarding";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SavedProgress {
  step: number;
  selectedType: string | null;
  selectedPlans: string[];
  selectedMode: string | null;
  soloWorkoutEnv: string | null;
  charName: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();

  // Selections
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [soloWorkoutEnv, setSoloWorkoutEnv] = useState<string | null>(null);
  const [charName, setCharName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Restore saved progress on mount ──────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: SavedProgress = JSON.parse(raw);
        if (saved.step > 0 && saved.step < 5) {
          setStep(saved.step);
          setSelectedType(saved.selectedType);
          setSelectedPlans(saved.selectedPlans ?? []);
          setSelectedMode(saved.selectedMode);
          setSoloWorkoutEnv(saved.soloWorkoutEnv ?? null);
          setCharName(saved.charName ?? "");
        }
      }
    } catch {
      // Ignore malformed storage
    }
  }, []);

  // ── Persist progress on every change ─────────────────────────────────────
  const persist = useCallback(
    (overrides?: Partial<SavedProgress>) => {
      const state: SavedProgress = {
        step,
        selectedType,
        selectedPlans,
        selectedMode,
        soloWorkoutEnv,
        charName,
        ...overrides,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    [step, selectedType, selectedPlans, selectedMode, soloWorkoutEnv, charName]
  );

  const goTo = (next: number, overrides?: Partial<SavedProgress>) => {
    setError("");
    setStep(next);
    persist({ step: next, ...overrides });
  };

  // ── Body type selection ───────────────────────────────────────────────────
  const handleBodyTypeSelect = (type: string) => {
    setSelectedType(type);
    persist({ selectedType: type });
  };

  // ── Multi-select workout plans ────────────────────────────────────────────
  const togglePlan = (id: string) => {
    setSelectedPlans((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      persist({ selectedPlans: next });
      return next;
    });
  };

  // ── Resolve RANDOM body type ──────────────────────────────────────────────
  const resolveBodyType = (): string => {
    if (selectedType !== "RANDOM") return selectedType!;
    return REAL_BODY_TYPES[Math.floor(Math.random() * REAL_BODY_TYPES.length)];
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleCreateCharacter = async () => {
    if (!selectedType || !charName.trim() || selectedPlans.length === 0 || !selectedMode) return;
    setError("");
    setLoading(true);

    const resolvedBodyType = resolveBodyType();

    try {
      // 1. Create character
      const charRes = await fetch("/api/game/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: charName.trim(),
          bodyType: resolvedBodyType,
          // Goals and training environment tilt the opening stat block —
          // see startingStatsFor() in the game engine.
          planTypes: selectedPlans
            .map((id) => WORKOUT_PLANS.find((p) => p.id === id)?.type)
            .filter((t): t is string => !!t),
          workoutEnv: soloWorkoutEnv,
        }),
      });
      const charData = await charRes.json();
      if (!charRes.ok) {
        setError(charData.error ?? "Failed to create character");
        setLoading(false);
        return;
      }

      // 2. Assign all selected workout plans
      if (charData.character?.id) {
        await Promise.allSettled(
          selectedPlans.map((planId) => {
            const plan = WORKOUT_PLANS.find((p) => p.id === planId);
            if (!plan) return Promise.resolve();
            return fetch("/api/game/plans", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                characterId: charData.character.id,
                type: plan.type,
                name: plan.name,
              }),
            });
          })
        );
      }

      // 3. Set game mode
      await fetch("/api/game/mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selectedMode }),
      }).catch(() => {});

      // 4. Mark onboarding complete
      await fetch("/api/game/onboarding", { method: "POST" }).catch(() => {});

      // 5. Clear saved progress
      localStorage.removeItem(STORAGE_KEY);

      goTo(5);
    } catch (err) {
      setError("An error occurred. Please try again.");
      console.error("[onboarding] error:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedBodyType = BODY_TYPES.find((b) => b.type === selectedType);

  // What the character will actually open on, given every pick so far. RANDOM
  // is previewed as AVERAGE since the real roll happens at submit.
  const previewStats = startingStatsFor({
    bodyType: selectedType === "RANDOM" || !selectedType ? "AVERAGE" : selectedType,
    planTypes: selectedPlans
      .map((id) => WORKOUT_PLANS.find((p) => p.id === id)?.type)
      .filter((t): t is string => !!t),
    workoutEnv: soloWorkoutEnv,
  });
  const isResuming = step > 0 && step < 5;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Dot step indicator */}
      {step > 0 && step < 5 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          padding: "14px 20px 4px",
        }}>
          {[1, 2, 3, 4].map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{
                width: step === s ? 28 : 22,
                height: 22,
                borderRadius: "99px",
                background: step > s
                  ? "linear-gradient(135deg,#6c47ff,#00d4aa)"
                  : step === s
                  ? "#6c47ff"
                  : "var(--bg-elevated)",
                border: `1.5px solid ${step >= s ? "#6c47ff" : "var(--border-subtle)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                fontWeight: 800,
                color: step >= s ? "#fff" : "var(--text-muted)",
                transition: "all 0.3s ease",
              }}>
                {step > s ? "✓" : s}
              </div>
              {s < 4 && <div style={{
                width: 24, height: 2,
                background: step > s ? "#6c47ff" : "var(--bg-elevated)",
                transition: "background 0.3s ease",
              }} />}
            </div>
          ))}
        </div>
      )}

      {/* Back button row */}
      {step > 0 && step < 5 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px" }}>
          <button
            id="onboard-back"
            onClick={() => goTo(step - 1)}
            style={{
              background: "none",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              color: "var(--text-secondary)",
              padding: "6px 12px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {["Body", "Character", "Goals", "Mode"][step - 1]}
          </span>
        </div>
      )}

      {/* Resume banner */}
      {step === 0 && isResuming && (
        <div
          style={{
            margin: "16px 24px 0",
            padding: "12px 16px",
            background: "rgba(108,71,255,0.12)",
            border: "1px solid rgba(108,71,255,0.3)",
            borderRadius: "10px",
            fontSize: "13px",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <span>🔖 You have unfinished setup</span>
          <button
            onClick={() => goTo(step)}
            style={{
              background: "var(--purple)",
              border: "none",
              borderRadius: "6px",
              color: "#fff",
              padding: "4px 10px",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Resume
          </button>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          maxWidth: 480,
          margin: "0 auto",
          width: "100%",
        }}
      >

        {/* ── Step 0: Welcome ──────────────────────────────────────────── */}
        {step === 0 && (
          <div style={{ textAlign: "center", width: "100%" }}>
            {/* Animated hero */}
            <div style={{
              position: "relative",
              width: "120px",
              height: "120px",
              margin: "0 auto 24px",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(108,71,255,0.3) 0%, transparent 70%)",
                animation: "hero-pulse 2.5s ease-in-out infinite",
              }} />
              <div style={{
                position: "absolute", inset: "10px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(108,71,255,0.2), rgba(0,212,170,0.1))",
                border: "1.5px solid rgba(108,71,255,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "52px",
                animation: "hero-bob 3s ease-in-out infinite",
              }}>🏋️</div>
            </div>

            <h1 className="gradient-text" style={{ fontSize: "34px", fontWeight: 900, margin: "0 0 10px", lineHeight: 1.1 }}>
              Welcome to<br />GymPrenuer
            </h1>
            <p style={{ color: "var(--text-secondary)", margin: "0 0 32px", lineHeight: 1.7, fontSize: "14px" }}>
              Build your character. Train hard.<br />Own your gym. Earn GYMFIT on Base.
            </p>

            {/* Feature cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "32px" }}>
              {[
                { icon: "🎮", title: "Live Game World",  desc: "Control your character in a real-time gym", color: "#6c47ff" },
                { icon: "💪", title: "Train & Earn",     desc: "XP + GYMFIT tokens for every workout",     color: "#f72585" },
                { icon: "🏢", title: "Own a Gym",        desc: "Buy, upgrade and manage your own gym",     color: "#f59e0b" },
                { icon: "💰", title: "Passive Income",   desc: "NPCs pay fees — collect while you sleep",  color: "#00d4aa" },
              ].map((f) => (
                <div key={f.title} style={{
                  padding: "14px 12px",
                  borderRadius: "14px",
                  background: `${f.color}0e`,
                  border: `1.5px solid ${f.color}33`,
                  textAlign: "left",
                }}>
                  <div style={{ fontSize: "24px", marginBottom: "6px" }}>{f.icon}</div>
                  <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: "12px", color: f.color }}>{f.title}</p>
                  <p style={{ margin: 0, fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.4 }}>{f.desc}</p>
                </div>
              ))}
            </div>

            <button
              id="onboard-start"
              className="btn btn-primary btn-lg"
              style={{ width: "100%", fontSize: "16px" }}
              onClick={() => goTo(1)}
            >
              Let&apos;s Go →
            </button>

            <style>{`
              @keyframes hero-pulse {
                0%,100% { transform: scale(1); opacity:0.6; }
                50% { transform: scale(1.15); opacity:1; }
              }
              @keyframes hero-bob {
                0%,100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
              }
            `}</style>
          </div>
        )}

        {/* ── Step 1: Body Type ────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ width: "100%" }}>
            <h2 style={{ fontSize: "24px", fontWeight: 800, textAlign: "center", margin: "0 0 8px" }}>
              Choose Your Starting Body
            </h2>
            <p style={{ color: "var(--text-secondary)", textAlign: "center", margin: "0 0 28px", fontSize: "14px" }}>
              Each body type has unique stats. Pick <strong>Random</strong> to let fate decide!
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "28px",
              }}
            >
              {BODY_TYPES.map((b) => (
                <button
                  key={b.type}
                  id={`body-type-${b.type.toLowerCase()}`}
                  className={`body-type-card ${selectedType === b.type ? "selected" : ""}`}
                  onClick={() => handleBodyTypeSelect(b.type)}
                  style={{
                    border: `2px solid ${selectedType === b.type ? b.color : "var(--border-subtle)"}`,
                    background: selectedType === b.type ? `${b.color}18` : "var(--bg-card)",
                    gridColumn: b.type === "RANDOM" ? "span 2" : "span 1",
                    display: "flex",
                    flexDirection: b.type === "RANDOM" ? "row" : "column",
                    alignItems: b.type === "RANDOM" ? "center" : "flex-start",
                    gap: b.type === "RANDOM" ? "12px" : "0",
                    padding: "14px",
                    position: "relative",
                  }}
                >
                  {b.type === "RANDOM" && (
                    <span
                      style={{
                        position: "absolute",
                        top: "6px",
                        right: "8px",
                        fontSize: "10px",
                        color: b.color,
                        fontWeight: 700,
                        letterSpacing: "0.5px",
                      }}
                    >
                      SURPRISE
                    </span>
                  )}
                  <p style={{ fontSize: b.type === "RANDOM" ? "32px" : "36px", margin: "0 0 8px" }}>{b.emoji}</p>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "14px", color: b.color }}>{b.label}</p>
                    <p style={{ margin: b.type === "RANDOM" ? "0" : "0 0 10px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>{b.desc}</p>
                    {b.type !== "RANDOM" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {STAT_LABELS.map(([key, label]) => (
                          <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                            <span style={{ color: "var(--text-muted)" }}>{label}</span>
                            <span style={{ fontWeight: 700 }}>{b.stats[key]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button
              id="body-type-next"
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled={!selectedType}
              onClick={() => goTo(2)}
            >
              Next →
            </button>
          </div>
        )}

        {/* ── Step 2: Name Your Character ──────────────────────────────── */}
        {step === 2 && (
          <div style={{ width: "100%", textAlign: "center" }}>
            <p style={{ fontSize: "56px", margin: "0 0 16px" }}>
              {selectedType === "RANDOM" ? "🎲" : selectedBodyType?.emoji}
            </p>
            <h2 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 8px" }}>
              Name Your Character
            </h2>
            <p style={{ color: "var(--text-secondary)", margin: "0 0 28px", fontSize: "14px" }}>
              This is the name other players will see.
            </p>
            <input
              id="character-name"
              className="input"
              placeholder="Enter character name..."
              value={charName}
              onChange={(e) => {
                setCharName(e.target.value);
                persist({ charName: e.target.value });
              }}
              maxLength={30}
              style={{ marginBottom: "12px", textAlign: "center" }}
            />
            {error && (
              <p style={{ color: "#ff4d6d", fontSize: "13px", margin: "0 0 12px" }}>{error}</p>
            )}
            <button
              id="character-name-next"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "8px" }}
              disabled={charName.trim().length < 2}
              onClick={() => goTo(3)}
            >
              Next →
            </button>
          </div>
        )}

        {/* ── Step 3: Workout Goals (multi-select) ─────────────────────── */}
        {step === 3 && (
          <div style={{ width: "100%" }}>
            <h2 style={{ fontSize: "24px", fontWeight: 800, textAlign: "center", margin: "0 0 8px" }}>
              Pick Your Training Goals
            </h2>
            <p style={{ color: "var(--text-secondary)", textAlign: "center", margin: "0 0 6px", fontSize: "14px" }}>
              Select one or more. You can mix and match styles!
            </p>
            <p style={{ color: "var(--text-muted)", textAlign: "center", margin: "0 0 24px", fontSize: "12px" }}>
              {selectedPlans.length === 0
                ? "No goals selected"
                : `${selectedPlans.length} goal${selectedPlans.length > 1 ? "s" : ""} selected`}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
              {WORKOUT_PLANS.map((plan) => {
                const isSelected = selectedPlans.includes(plan.id);
                return (
                  <button
                    key={plan.id}
                    id={`plan-${plan.id}`}
                    onClick={() => togglePlan(plan.id)}
                    style={{
                      border: `2px solid ${isSelected ? plan.color : "var(--border-subtle)"}`,
                      background: isSelected ? `${plan.color}18` : "var(--bg-card)",
                      borderRadius: "12px",
                      textAlign: "left",
                      padding: "14px 16px",
                      cursor: "pointer",
                      display: "flex",
                      gap: "12px",
                      alignItems: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: "28px", flexShrink: 0 }}>{plan.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: "14px", color: isSelected ? plan.color : "var(--text-primary)" }}>
                        {plan.name}
                      </p>
                      <p style={{ margin: "0", fontSize: "12px", color: "var(--text-secondary)" }}>
                        {plan.desc}
                      </p>
                    </div>
                    <div
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        border: `2px solid ${isSelected ? plan.color : "var(--border-subtle)"}`,
                        background: isSelected ? plan.color : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        fontSize: "12px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isSelected && "✓"}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              id="plan-next"
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled={selectedPlans.length === 0}
              onClick={() => goTo(4)}
            >
              Next →
            </button>
          </div>
        )}

        {/* ── Step 4: Game Mode ────────────────────────────────────────── */}
        {step === 4 && (
          <div style={{ width: "100%" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ fontSize: "40px", marginBottom: "8px" }}>🎮</div>
              <h2 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 6px" }}>Choose Your Path</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
                How do you want to play GymPrenuer?
              </p>
            </div>

            {/* Mode cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              {GAME_MODES.map((gameMode) => {
                const isActive = selectedMode === gameMode.mode;
                const accentColor = gameMode.mode === "SOLO" ? "#6c47ff" : "#00d4aa";
                return (
                  <button
                    key={gameMode.mode}
                    id={`mode-${gameMode.mode.toLowerCase()}`}
                    onClick={() => {
                      setSelectedMode(gameMode.mode);
                      if (gameMode.mode !== "SOLO") setSoloWorkoutEnv(null);
                      persist({ selectedMode: gameMode.mode, soloWorkoutEnv: gameMode.mode !== "SOLO" ? null : soloWorkoutEnv });
                    }}
                    style={{
                      border: `2px solid ${isActive ? accentColor : "var(--border-subtle)"}`,
                      background: isActive ? `${accentColor}18` : "var(--bg-card)",
                      borderRadius: "16px",
                      textAlign: "left",
                      padding: "18px 16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {isActive && (
                      <div style={{
                        position: "absolute", top: 0, right: 0,
                        background: accentColor, color: "#fff",
                        fontSize: "9px", fontWeight: 800,
                        padding: "3px 10px",
                        borderBottomLeftRadius: "10px",
                        letterSpacing: "1px",
                      }}>SELECTED</div>
                    )}
                    <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                      <div style={{
                        width: "52px", height: "52px", borderRadius: "14px", flexShrink: 0,
                        background: `${accentColor}22`,
                        border: `1.5px solid ${accentColor}55`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "26px",
                      }}>{gameMode.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 4px", fontWeight: 800, fontSize: "16px", color: isActive ? accentColor : "var(--text-primary)" }}>
                          {gameMode.label}
                        </p>
                        <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          {gameMode.desc}
                        </p>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {gameMode.features.map((feature) => (
                            <span key={feature} style={{
                              fontSize: "10px", padding: "2px 8px", borderRadius: "99px", fontWeight: 600,
                              background: `${accentColor}18`,
                              color: accentColor,
                              border: `1px solid ${accentColor}44`,
                            }}>
                              ✓ {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Solo sub-selection: gym or home */}
            {selectedMode === "SOLO" && (
              <div style={{
                marginBottom: "20px",
                padding: "16px",
                background: "rgba(108,71,255,0.06)",
                border: "1px solid rgba(108,71,255,0.25)",
                borderRadius: "14px",
                animation: "fade-in 0.3s ease",
              }}>
                <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: "13px", color: "#a78bfa" }}>
                  🏃 Where will you primarily train?
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {[
                    { env: "GYM", icon: "🏢", label: "At the Gym", desc: "Equipment, NPCs,\nmore XP rewards", color: "#6c47ff" },
                    { env: "HOME", icon: "🏠", label: "At Home", desc: "Bodyweight, flexible\nschedule, streaks", color: "#00d4aa" },
                  ].map(({ env, icon, label, desc, color }) => (
                    <button
                      key={env}
                      id={`solo-env-${env.toLowerCase()}`}
                      onClick={() => {
                        setSoloWorkoutEnv(env);
                        persist({ soloWorkoutEnv: env });
                      }}
                      style={{
                        border: `2px solid ${soloWorkoutEnv === env ? color : "var(--border-subtle)"}`,
                        background: soloWorkoutEnv === env ? `${color}18` : "var(--bg-card)",
                        borderRadius: "12px", padding: "14px 12px",
                        cursor: "pointer", transition: "all 0.15s ease", textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "28px", marginBottom: "6px" }}>{icon}</div>
                      <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "13px", color: soloWorkoutEnv === env ? color : "var(--text-primary)" }}>
                        {label}
                      </p>
                      <p style={{ margin: 0, fontSize: "10px", color: "var(--text-muted)", whiteSpace: "pre-line", lineHeight: 1.4 }}>
                        {desc}
                      </p>
                    </button>
                  ))}
                </div>
                <p style={{ margin: "10px 0 0", fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
                  You can switch between gym &amp; home anytime in-game
                </p>
              </div>
            )}

            {/* Opening stats — the sum of every choice made so far */}
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-card)",
                borderRadius: "14px",
                padding: "14px",
                marginBottom: "16px",
              }}
            >
              <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700, letterSpacing: "0.4px", color: "var(--text-secondary)" }}>
                YOUR STARTING STATS
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                {STAT_LABELS.map(([key, label]) => (
                  <div key={key} style={{ textAlign: "center" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "10px", color: "var(--text-muted)" }}>{label}</p>
                    <p style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>{previewStats[key]}</p>
                  </div>
                ))}
              </div>
              <p style={{ margin: "10px 0 0", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Every stat needs <strong>{STAT_PER_LEVEL}</strong> to reach Lv.2. Train in-game — or link
                your workout app in your profile and let real sessions do it.
              </p>
            </div>

            <button
              id="mode-next"
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled={!selectedMode || (selectedMode === "SOLO" && !soloWorkoutEnv) || loading}
              onClick={handleCreateCharacter}
            >
              {loading ? "Creating your character..." : "Start Your Journey →"}
            </button>
            {error && (
              <p style={{ color: "#ff4d6d", fontSize: "13px", margin: "12px 0 0", textAlign: "center" }}>
                {error}
              </p>
            )}
            <style>{`@keyframes fade-in { from { opacity:0; transform:translateY(-8px);} to { opacity:1; transform:translateY(0);} }`}</style>
          </div>
        )}

        {/* ── Step 5: Done ─────────────────────────────────────────────── */}
        {step === 5 && (
          <div style={{ textAlign: "center", width: "100%" }}>
            {/* Confetti burst */}
            <div style={{ position: "relative", width: "140px", height: "140px", margin: "0 auto 24px" }}>
              {["#6c47ff","#00d4aa","#f72585","#f59e0b","#4cc9f0"].map((c, i) => (
                <div key={i} style={{
                  position: "absolute",
                  width: "8px", height: "8px",
                  borderRadius: "50%",
                  background: c,
                  top: "50%", left: "50%",
                  animation: `confetti-${i} 1.2s ease-out forwards`,
                  animationDelay: `${i * 0.08}s`,
                }} />
              ))}
              <div style={{
                position: "absolute", inset: "16px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(108,71,255,0.3), rgba(0,212,170,0.2))",
                border: "2px solid rgba(108,71,255,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "52px",
                animation: "hero-bob 2s ease-in-out infinite",
              }}>🏆</div>
            </div>

            <h2 className="gradient-text" style={{ fontSize: "30px", fontWeight: 900, margin: "0 0 6px" }}>
              You&apos;re ready, {charName}!
            </h2>
            <p style={{ color: "var(--text-secondary)", margin: "0 0 24px", lineHeight: 1.6, fontSize: "14px" }}>
              Your character is live. Start training to earn XP &amp; GYMFIT tokens.
            </p>

            {/* Training environment badge */}
            {soloWorkoutEnv && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                padding: "8px 16px", borderRadius: "99px",
                background: soloWorkoutEnv === "GYM" ? "rgba(108,71,255,0.15)" : "rgba(0,212,170,0.15)",
                border: `1px solid ${soloWorkoutEnv === "GYM" ? "rgba(108,71,255,0.4)" : "rgba(0,212,170,0.4)"}`,
                color: soloWorkoutEnv === "GYM" ? "#a78bfa" : "#00d4aa",
                fontSize: "13px", fontWeight: 700, marginBottom: "20px",
              }}>
                {soloWorkoutEnv === "GYM" ? "🏢 Gym Warrior" : "🏠 Home Trainer"}
              </div>
            )}

            {/* Plan badges */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginBottom: "28px" }}>
              {selectedPlans.map((id) => {
                const p = WORKOUT_PLANS.find((pl) => pl.id === id);
                return p ? (
                  <span key={id} style={{
                    fontSize: "11px", padding: "4px 10px", borderRadius: "99px",
                    background: `${p.color}18`, color: p.color,
                    border: `1px solid ${p.color}44`, fontWeight: 600,
                  }}>
                    {p.icon} {p.name}
                  </span>
                ) : null;
              })}
            </div>

            <button
              id="onboard-finish"
              className="btn btn-primary btn-lg"
              style={{ width: "100%", fontSize: "16px", marginBottom: "10px" }}
              onClick={() => router.push("/play")}
            >
              🎮 Enter Game World →
            </button>
            <button
              style={{ width: "100%", background: "none", border: "none", color: "var(--text-muted)", fontSize: "13px", cursor: "pointer", padding: "8px" }}
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard instead
            </button>

            <style>{`
              @keyframes hero-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
              @keyframes confetti-0{to{transform:translate(-40px,-50px) scale(0);opacity:0}}
              @keyframes confetti-1{to{transform:translate(40px,-50px) scale(0);opacity:0}}
              @keyframes confetti-2{to{transform:translate(-50px,10px) scale(0);opacity:0}}
              @keyframes confetti-3{to{transform:translate(50px,10px) scale(0);opacity:0}}
              @keyframes confetti-4{to{transform:translate(0,60px) scale(0);opacity:0}}
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}
