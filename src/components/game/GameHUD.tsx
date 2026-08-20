"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { EventBus } from "@/lib/game/EventBus";
import { XpBar } from "@/components/xp/XpBar";
import { AudioManager } from "@/lib/game/systems/AudioManager";
import { xpRequiredForLevel } from "@/lib/game/engine";

interface GameHUDProps {
  playerName: string;
  initialXp: number;
  initialOverflow: number;
  initialRestUntil: string | null;
  initialLastRegenAt: string;
  initialTokens: number;
  initialLevel: number;
  streakCount: number;
  gymName?: string;
  hasGym: boolean;
}

type ActiveScene = "GymScene" | "HomeScene";

// Animated number counter hook
function useAnimatedNumber(target: number, duration = 500) {
  const [display, setDisplay] = useState(target);
  const ref = useRef<number>(target);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const value = Math.round(start + diff * eased);
      setDisplay(value);
      ref.current = value;
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [target, duration]);

  return display;
}

export function GameHUD({
  playerName,
  initialXp,
  initialOverflow,
  initialRestUntil,
  initialLastRegenAt,
  initialTokens,
  initialLevel,
  streakCount,
  gymName,
  hasGym,
}: GameHUDProps) {
  const [currentXp, setCurrentXp]       = useState(initialXp);
  const [overflowXp, setOverflowXp]     = useState(initialOverflow);
  const [restUntil, setRestUntil]       = useState<string | null>(initialRestUntil);
  const [lastRegenAt, setLastRegenAt]   = useState(initialLastRegenAt);
  const [tokens, setTokens]             = useState(initialTokens);
  const [level, setLevel]               = useState(initialLevel);
  const [levelingUp, setLevelingUp]     = useState(false);
  const [activeScene, setActiveScene]   = useState<ActiveScene>(hasGym ? "GymScene" : "HomeScene");
  const [isFirstPerson, setIsFirstPerson] = useState(false);
  const [workoutReward, setWorkoutReward] = useState<{ xp: number; tokens: number } | null>(null);
  const [npcCount, setNpcCount]          = useState(0);
  const [pendingIncome, setPendingIncome] = useState(0);
  const [workoutActive, setWorkoutActive] = useState(false);

  const displayTokens = useAnimatedNumber(tokens);
  const displayPending = useAnimatedNumber(pendingIncome);
  const levelUpCost = xpRequiredForLevel(level);
  const canLevelUp = currentXp + overflowXp >= levelUpCost;

  const handleLevelUp = useCallback(async () => {
    if (levelingUp) return;
    setLevelingUp(true);
    try {
      const res = await fetch("/api/game/level-up", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setLevel(data.level);
        setCurrentXp(data.currentXp);
        setOverflowXp(data.overflowXp);
        EventBus.emit("player:level_up", { newLevel: data.level });
        AudioManager.playUIClick();
      }
    } catch { /* silent */ } finally {
      setLevelingUp(false);
    }
  }, [levelingUp]);

  const handleQuitWorkout = useCallback(() => {
    EventBus.emit("hud:quit_workout");
  }, []);

  // Init audio on mount
  useEffect(() => { AudioManager.init(); }, []);

  // ── Subscribe to EventBus ─────────────────────────────────────
  useEffect(() => {
    const onXpChanged = (d: { currentXp: number; overflowXp: number; restUntil: string | null }) => {
      setCurrentXp(d.currentXp);
      setOverflowXp(d.overflowXp);
      setRestUntil(d.restUntil);
      setLastRegenAt(new Date().toISOString());
    };
    const onWorkoutStarted = () => setWorkoutActive(true);
    const onWorkoutQuit = () => setWorkoutActive(false);
    const onWorkoutComplete = async (d: { xpEarned: number; tokensEarned: number; equipmentId?: string; intensity?: string }) => {
      setWorkoutActive(false);
      setWorkoutReward({ xp: d.xpEarned, tokens: d.tokensEarned });
      setTokens((t) => t + d.tokensEarned);
      setTimeout(() => setWorkoutReward(null), 3500);

      try {
        const res = await fetch("/api/game/workout/gym", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xpEarned:    d.xpEarned,
            tokensEarned: d.tokensEarned,
            intensity:   d.intensity ?? "MEDIUM",
            equipmentId: d.equipmentId ?? "unknown",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentXp(data.currentXp);
          setOverflowXp(data.overflowXp);
          setRestUntil(data.restUntil ?? null);
          setLastRegenAt(new Date().toISOString());
          EventBus.emit("player:xp_changed", {
            currentXp:  data.currentXp,
            overflowXp: data.overflowXp,
            restUntil:  data.restUntil ?? null,
          });
          if (data.exhausted) {
            EventBus.emit("player:exhausted", { restUntil: data.restUntil });
          }
        }
      } catch { /* silent — optimistic update already shown */ }
    };
    const onIncomeCollected = (d: { amount: number }) => {
      setTokens((t) => t + d.amount);
      setPendingIncome(0);
    };
    const onNpcPaid = (d: { amount: number }) => {
      setPendingIncome((p) => p + d.amount);
    };
    const onNpcEntered = () => setNpcCount((n) => n + 1);
    const onNpcLeft = () => setNpcCount((n) => Math.max(0, n - 1));
    const onFirstPerson = (d: { enabled: boolean }) => setIsFirstPerson(d.enabled);

    EventBus.on("player:xp_changed", onXpChanged);
    EventBus.on("workout:started", onWorkoutStarted);
    EventBus.on("workout:complete", onWorkoutComplete);
    EventBus.on("workout:quit", onWorkoutQuit);
    EventBus.on("income:collected", onIncomeCollected);
    EventBus.on("npc:paid", onNpcPaid);
    EventBus.on("npc:entered", onNpcEntered);
    EventBus.on("npc:left_dissatisfied", onNpcLeft);
    EventBus.on("workout:firstperson_toggle", onFirstPerson);

    return () => {
      EventBus.off("player:xp_changed", onXpChanged);
      EventBus.off("workout:started", onWorkoutStarted);
      EventBus.off("workout:complete", onWorkoutComplete);
      EventBus.off("workout:quit", onWorkoutQuit);
      EventBus.off("income:collected", onIncomeCollected);
      EventBus.off("npc:paid", onNpcPaid);
      EventBus.off("npc:entered", onNpcEntered);
      EventBus.off("npc:left_dissatisfied", onNpcLeft);
      EventBus.off("workout:firstperson_toggle", onFirstPerson);
    };
  }, []);

  // ── XP regen sync ────────────────────────────────────────────
  const syncXp = useCallback(async () => {
    try {
      const res = await fetch("/api/game/xp/regen", { method: "PATCH" });
      if (res.ok) {
        const d = await res.json();
        setCurrentXp(d.currentXp);
        setOverflowXp(d.overflowXp);
        setRestUntil(d.restUntil ?? null);
        setLastRegenAt(new Date().toISOString());
        EventBus.emit("player:xp_changed", { currentXp: d.currentXp, overflowXp: d.overflowXp, restUntil: d.restUntil ?? null });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    syncXp();
    const id = setInterval(syncXp, 30_000);
    return () => clearInterval(id);
  }, [syncXp]);

  // ── Scene switch ─────────────────────────────────────────────
  const switchScene = (to: ActiveScene) => {
    AudioManager.playUIClick();
    setActiveScene(to);
    EventBus.emit("scene:switch", { to });
  };

  if (isFirstPerson) return null;

  return (
    <>
      {/* ── Top HUD Bar ── */}
      <div style={styles.topBar}>
        {/* Player info */}
        <div style={styles.playerRow}>
          <div style={styles.avatarOuter}>
            <div style={styles.avatar}>🏋️</div>
          </div>
          <div>
            <div style={styles.playerName}>{playerName} · Lv.{level}</div>
            <div style={styles.streakBadge}>🔥 {streakCount} day streak</div>
          </div>
          <div style={styles.badgeRow}>
            {npcCount > 0 && (
              <span style={styles.npcBadge}>👥 {npcCount}</span>
            )}
            {displayPending > 0 && (
              <span style={styles.incomeBadge}>💰 +{displayPending}</span>
            )}
            <span style={styles.tokenBadge}>
              {displayTokens.toLocaleString()} 🪙
            </span>
          </div>
        </div>

        {/* XP Bar */}
        <div style={{ pointerEvents: "auto", marginTop: "6px" }}>
          <XpBar currentXp={currentXp} overflowXp={overflowXp} restUntil={restUntil} lastXpRegenAt={lastRegenAt} />
        </div>

        {/* Level up */}
        {canLevelUp && (
          <button
            onClick={handleLevelUp}
            disabled={levelingUp}
            style={styles.levelUpBtn}
          >
            {levelingUp ? "Leveling..." : `⬆️ Level Up to ${level + 1} (${levelUpCost} XP)`}
          </button>
        )}
      </div>

      {/* ── Quit workout ── */}
      {workoutActive && (
        <div style={styles.quitWorkoutWrap}>
          <button onClick={handleQuitWorkout} style={styles.quitWorkoutBtn}>
            ✕ Quit Workout
          </button>
        </div>
      )}

      {/* ── Scene switcher ── */}
      <div style={styles.sceneSwitcher}>
        <div style={styles.sceneSwitcherInner}>
          <button
            onClick={() => switchScene("HomeScene")}
            style={{
              ...styles.sceneBtn,
              ...(activeScene === "HomeScene" ? styles.sceneBtnActive : {}),
            }}
          >
            🏠 Home
          </button>
          {hasGym ? (
            <button
              onClick={() => switchScene("GymScene")}
              style={{
                ...styles.sceneBtn,
                ...(activeScene === "GymScene" ? styles.sceneBtnActive : {}),
              }}
            >
              🏢 {gymName ?? "Gym"}
            </button>
          ) : (
            <a href="/gyms" style={styles.joinLink}>+ Join Gym</a>
          )}
          <a href="/dashboard" style={styles.menuLink}>☰</a>
          {/* Active indicator bar */}
          <div style={{
            ...styles.tabIndicator,
            left: activeScene === "HomeScene" ? "8px" : hasGym ? "50%" : "8px",
          }} />
        </div>
      </div>

      {/* ── Workout reward popup ── */}
      {workoutReward && (
        <div style={styles.rewardPopup}>
          <div style={styles.rewardEmoji}>🎉</div>
          <div style={styles.rewardXp}>+{workoutReward.xp} XP</div>
          <div style={styles.rewardTokens}>+{workoutReward.tokens} 🪙</div>
          {/* Confetti dots */}
          <div style={styles.confettiContainer}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{
                ...styles.confettiDot,
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${i * 0.08}s`,
                backgroundColor: ["#a78bfa", "#00d4aa", "#ffd700", "#f72585", "#4cc9f0"][i % 5],
              }} />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-badge {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes reward-slide-in {
          0% { transform: translateX(-50%) translateY(20px) scale(0.8); opacity: 0; }
          50% { transform: translateX(-50%) translateY(-8px) scale(1.05); opacity: 1; }
          100% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(60px) rotate(360deg); opacity: 0; }
        }
        @keyframes tab-slide {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  topBar: {
    position: "fixed",
    top: 0, left: 0, right: 0,
    zIndex: 50,
    padding: "10px 12px 10px",
    background: "linear-gradient(180deg, rgba(9,9,15,0.96) 0%, rgba(9,9,15,0.85) 70%, rgba(9,9,15,0) 100%)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    pointerEvents: "none",
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  },
  avatarOuter: {
    width: 36, height: 36,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #6c47ff 0%, #00d4aa 100%)",
    padding: "2px",
    flexShrink: 0,
  },
  avatar: {
    width: "100%", height: "100%",
    borderRadius: "50%",
    background: "#0d0d18",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "16px",
  },
  playerName: {
    fontSize: "13px", fontWeight: 700, color: "#e8e8f0",
    letterSpacing: "0.3px",
  },
  streakBadge: {
    fontSize: "10px", color: "#5a5a70",
  },
  badgeRow: {
    display: "flex", gap: "6px", alignItems: "center",
    marginLeft: "auto", pointerEvents: "auto",
  },
  npcBadge: {
    fontSize: "10px",
    background: "rgba(0,212,170,0.12)",
    color: "#00d4aa",
    borderRadius: "99px",
    padding: "3px 8px",
    border: "1px solid rgba(0,212,170,0.25)",
    fontWeight: 600,
  },
  incomeBadge: {
    fontSize: "10px",
    background: "rgba(255,215,0,0.12)",
    color: "#ffd700",
    borderRadius: "99px",
    padding: "3px 8px",
    border: "1px solid rgba(255,215,0,0.25)",
    fontWeight: 600,
    animation: "pulse-badge 1.2s ease-in-out infinite",
  },
  tokenBadge: {
    fontSize: "12px",
    background: "rgba(255,215,0,0.08)",
    color: "#ffd700",
    borderRadius: "99px",
    padding: "4px 10px",
    border: "1px solid rgba(255,215,0,0.2)",
    fontWeight: 700,
    letterSpacing: "0.3px",
  },
  levelUpBtn: {
    marginTop: "8px",
    width: "100%",
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,215,0,0.4)",
    background: "linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,107,53,0.15))",
    color: "#ffd700",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    pointerEvents: "auto" as const,
    animation: "pulse-badge 1.4s ease-in-out infinite",
  },
  quitWorkoutWrap: {
    position: "fixed" as const,
    bottom: 168,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 50,
    pointerEvents: "auto" as const,
  },
  quitWorkoutBtn: {
    padding: "7px 16px",
    borderRadius: "10px",
    border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(9,9,15,0.92)",
    color: "#f87171",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    backdropFilter: "blur(12px)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  },
  sceneSwitcher: {
    position: "fixed",
    bottom: 100,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 50,
    pointerEvents: "auto",
  },
  sceneSwitcherInner: {
    display: "flex",
    gap: "4px",
    background: "rgba(9,9,15,0.92)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderRadius: "14px",
    padding: "5px 6px",
    border: "1px solid rgba(108,71,255,0.2)",
    position: "relative" as const,
    boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 0 1px rgba(108,71,255,0.3)",
  },
  sceneBtn: {
    padding: "7px 16px",
    borderRadius: "10px",
    border: "none",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
    background: "transparent",
    color: "#5a5a70",
    transition: "all 0.2s ease",
    position: "relative" as const,
    zIndex: 1,
  },
  sceneBtnActive: {
    fontWeight: 700,
    background: "linear-gradient(135deg, rgba(108,71,255,0.9), rgba(108,71,255,0.7))",
    color: "#ffffff",
    boxShadow: "0 2px 8px rgba(108,71,255,0.3)",
  },
  joinLink: {
    padding: "7px 14px",
    borderRadius: "10px",
    fontSize: "12px",
    color: "#5a5a70",
    textDecoration: "none",
  },
  menuLink: {
    padding: "7px 12px",
    borderRadius: "10px",
    fontSize: "14px",
    color: "#5a5a70",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
  },
  tabIndicator: {
    position: "absolute" as const,
    bottom: "2px",
    width: "40%",
    height: "2px",
    borderRadius: "2px",
    background: "linear-gradient(90deg, #6c47ff, #00d4aa)",
    transition: "left 0.3s cubic-bezier(0.4,0,0.2,1)",
    animation: "tab-slide 0.3s ease",
  },
  rewardPopup: {
    position: "fixed" as const,
    top: "32%",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 100,
    textAlign: "center" as const,
    animation: "reward-slide-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
    background: "rgba(9,9,15,0.96)",
    border: "1px solid rgba(108,71,255,0.5)",
    borderRadius: "20px",
    padding: "24px 40px 20px",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: "0 8px 40px rgba(108,71,255,0.25), 0 0 80px rgba(108,71,255,0.08)",
    overflow: "hidden" as const,
  },
  rewardEmoji: {
    fontSize: "48px",
    marginBottom: "6px",
    filter: "drop-shadow(0 2px 8px rgba(255,215,0,0.4))",
  },
  rewardXp: {
    fontSize: "26px", fontWeight: 900,
    color: "#c4b5fd",
    letterSpacing: "1px",
    textShadow: "0 0 20px rgba(108,71,255,0.5)",
  },
  rewardTokens: {
    fontSize: "20px", fontWeight: 700,
    color: "#ffd700",
    marginTop: "4px",
    textShadow: "0 0 12px rgba(255,215,0,0.3)",
  },
  confettiContainer: {
    position: "absolute" as const,
    inset: 0,
    overflow: "hidden" as const,
    pointerEvents: "none" as const,
  },
  confettiDot: {
    position: "absolute" as const,
    top: 0,
    width: "5px", height: "5px",
    borderRadius: "50%",
    animation: "confetti-fall 1.2s ease-in forwards",
  },
};
