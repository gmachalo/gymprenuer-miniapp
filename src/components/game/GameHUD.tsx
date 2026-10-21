"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { EventBus } from "@/lib/game/EventBus";
import { XpBar } from "@/components/xp/XpBar";
import { AudioManager } from "@/lib/game/systems/AudioManager";
import { statRequiredForLevel, xpRequiredForLevel, calculateTransformationStage } from "@/lib/game/engine";

interface CharacterStats {
  strength: number;
  stamina: number;
  discipline: number;
  metabolism: number;
}

interface GameHUDProps {
  playerName: string;
  initialXp: number;
  initialOverflow: number;
  initialRestUntil: string | null;
  initialLastRegenAt: string;
  initialTokens: number;
  initialLevel: number;
  characterStats: CharacterStats;
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

const CONFETTI_LEFT = Array.from({ length: 12 }, (_, i) => `${10 + ((i * 0.618) % 1) * 80}%`);

export function GameHUD({
  playerName,
  initialXp,
  initialOverflow,
  initialRestUntil,
  initialLastRegenAt,
  initialTokens,
  initialLevel,
  characterStats,
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
  const [hudError, setHudError] = useState<string | null>(null);
  const [activeScene, setActiveScene]   = useState<ActiveScene>(hasGym ? "GymScene" : "HomeScene");
  const [isFirstPerson, setIsFirstPerson] = useState(false);
  const [workoutReward, setWorkoutReward] = useState<{ xp: number; tokens: number } | null>(null);
  const [npcCount, setNpcCount]          = useState(0);
  const [pendingIncome, setPendingIncome] = useState(0);
  const [workoutActive, setWorkoutActive] = useState(false);
  // Stats gate level-up alongside XP, and they move as the player works out, so
  // they live in state (seeded from the server render) rather than in the prop.
  const [stats, setStats]                 = useState(characterStats);
  // Read by the EventBus handlers, whose effect subscribes once — state would be
  // captured stale. Home workouts must go to the home route, or trainers at the
  // player's gym get paid for sessions done at home.
  const activeSceneRef = useRef<ActiveScene>(activeScene);
  const topBarRef = useRef<HTMLDivElement>(null);
  const sceneSwitcherRef = useRef<HTMLDivElement>(null);
  useEffect(() => { activeSceneRef.current = activeScene; }, [activeScene]);

  const displayTokens = useAnimatedNumber(tokens);
  const displayPending = useAnimatedNumber(pendingIncome);
  const requiredStat = statRequiredForLevel(level);
  const levelUpCost = xpRequiredForLevel(level);
  const transformationStage = calculateTransformationStage(level);
  const statsMet =
    stats.strength   >= requiredStat &&
    stats.stamina    >= requiredStat &&
    stats.discipline >= requiredStat &&
    stats.metabolism >= requiredStat;
  const shortStats = (["strength", "stamina", "discipline", "metabolism"] as const)
    .filter((k) => stats[k] < requiredStat);
  const xpMet = currentXp + overflowXp >= levelUpCost;

  const handleLevelUp = useCallback(async () => {
    if (levelingUp) return;
    setLevelingUp(true);
    setHudError(null);
    try {
      const res = await fetch("/api/game/level-up", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setLevel(data.level);
        setCurrentXp(data.currentXp);
        setOverflowXp(data.overflowXp);
        EventBus.emit("player:level_up", { newLevel: data.level });
        AudioManager.playUIClick();
      } else {
        setHudError(data.error ?? "Level up failed");
        AudioManager.playError();
      }
    } catch {
      setHudError("Level up failed");
    } finally {
      setLevelingUp(false);
      setTimeout(() => setHudError(null), 4000);
    }
  }, [levelingUp]);

  const handleQuitWorkout = useCallback(() => {
    EventBus.emit("hud:quit_workout");
  }, []);

  // Init audio on mount
  useEffect(() => { AudioManager.init(); }, []);

  // ── Report the covered strips to the camera ──────────────────────
  // The stats bar covers the top of the canvas and the scene switcher plus the
  // app nav cover the bottom. The scenes' camera rig pads its bounds by these
  // amounts so nothing on the floor ends up stranded underneath (see CameraRig).
  useEffect(() => {
    let last = "";
    const measure = () => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      const c = canvas.getBoundingClientRect();
      if (c.height === 0) return;
      const top = topBarRef.current?.getBoundingClientRect();
      const bottomEdges = [sceneSwitcherRef.current, document.querySelector(".nav-bar")]
        .filter((el): el is Element => !!el)
        .map((el) => el.getBoundingClientRect().top);
      const insets = {
        top: Math.round(top ? Math.max(0, top.bottom - c.top) : 0),
        bottom: Math.round(Math.max(0, c.bottom - Math.min(c.bottom, ...bottomEdges))),
      };
      const key = `${insets.top}:${insets.bottom}`;
      if (key === last) return;
      last = key;
      EventBus.emit("hud:insets", insets);
    };
    const onSceneReady = () => {
      last = ""; // a freshly started scene needs the current values
      measure();
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (topBarRef.current) observer.observe(topBarRef.current);
    if (sceneSwitcherRef.current) observer.observe(sceneSwitcherRef.current);
    window.addEventListener("resize", measure);
    EventBus.on("scene:ready", onSceneReady);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      EventBus.off("scene:ready", onSceneReady);
    };
  }, []);

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
    const onWorkoutComplete = async (d: { xpCost: number; tokensEarned: number; equipmentId?: string; intensity?: string }) => {
      setWorkoutActive(false);

      try {
        const endpoint =
          activeSceneRef.current === "HomeScene" ? "/api/game/workout/home" : "/api/game/workout/gym";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            xpCost:      d.xpCost,
            tokensEarned: d.tokensEarned,
            intensity:   d.intensity ?? "MEDIUM",
            equipmentId: d.equipmentId ?? "unknown",
          }),
        });
        const data = await res.json();
        if (res.ok) {
          const paid = Number(data.tokensEarned ?? 0);
          setWorkoutReward({ xp: data.xpSpent, tokens: paid });
          setTokens((t) => t + paid);
          setTimeout(() => setWorkoutReward(null), 3500);

          setCurrentXp(data.currentXp);
          setOverflowXp(data.overflowXp);
          setRestUntil(data.restUntil ?? null);
          setLastRegenAt(new Date().toISOString());
          if (data.stats) setStats(data.stats);
          EventBus.emit("player:xp_changed", {
            currentXp:  data.currentXp,
            overflowXp: data.overflowXp,
            restUntil:  data.restUntil ?? null,
          });
          if (data.exhausted) {
            EventBus.emit("player:exhausted", { restUntil: data.restUntil });
          }
        } else {
          setHudError(data.error ?? "Workout could not be recorded");
          setTimeout(() => setHudError(null), 4000);
        }
      } catch {
        setHudError("Workout could not be recorded");
        setTimeout(() => setHudError(null), 4000);
      }
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
  // State is only touched from the promise callbacks, and the cancelled flag
  // keeps a slow response from landing after the HUD has unmounted.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetch("/api/game/xp/regen", { method: "PATCH" })
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          setCurrentXp(d.currentXp);
          setOverflowXp(d.overflowXp);
          setRestUntil(d.restUntil ?? null);
          setLastRegenAt(new Date().toISOString());
          if (d.stats) setStats(d.stats);
          EventBus.emit("player:xp_changed", { currentXp: d.currentXp, overflowXp: d.overflowXp, restUntil: d.restUntil ?? null });
        })
        .catch(() => { /* silent — the next tick retries */ });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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
      <div ref={topBarRef} style={styles.topBar}>
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
          <XpBar currentXp={currentXp} overflowXp={overflowXp} restUntil={restUntil} lastXpRegenAt={lastRegenAt} transformationStage={transformationStage} />
        </div>

        {/* Level up — stats gate eligibility, XP pays for the push */}
        <button
          onClick={handleLevelUp}
          disabled={levelingUp || !statsMet || !xpMet}
          style={{ ...styles.levelUpBtn, ...(statsMet && xpMet ? {} : styles.levelUpBtnLocked) }}
        >
          {levelingUp
            ? "Leveling..."
            : !statsMet
            ? `🔒 Need ${requiredStat} in all stats to hit Lv.${level + 1}`
            : !xpMet
            ? `🔒 Need ${levelUpCost} XP to hit Lv.${level + 1} (you have ${currentXp + overflowXp})`
            : `⬆️ Level Up to ${level + 1} (${levelUpCost} XP)`}
        </button>
        {hudError && (
          <div style={styles.hudErrorBanner}>⚠️ {hudError}</div>
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
      <div ref={sceneSwitcherRef} style={styles.sceneSwitcher}>
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
            <Link href="/gyms" style={styles.joinLink}>+ Join Gym</Link>
          )}
          <Link href="/dashboard" style={styles.menuLink}>☰</Link>
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
          <div style={styles.rewardXpSpent}>-{workoutReward.xp} XP</div>
          <div style={styles.rewardTokens}>+{workoutReward.tokens} 🪙</div>
          {/* Confetti dots */}
          <div style={styles.confettiContainer}>
            {CONFETTI_LEFT.map((left, i) => (
              <div key={i} style={{
                ...styles.confettiDot,
                left,
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
  levelUpBtnLocked: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#5a5a70",
    cursor: "not-allowed",
    animation: "none",
  },
  hudErrorBanner: {
    marginTop: "6px",
    padding: "6px 10px",
    borderRadius: "8px",
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#f87171",
    fontSize: "11px",
    fontWeight: 600,
    pointerEvents: "auto" as const,
  },
  quitWorkoutWrap: {
    position: "fixed" as const,
    bottom: "calc(84px + env(safe-area-inset-bottom, 0px))", // just above the scene switcher
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
    // The app nav is hidden on /play, so this sits at the screen edge.
    bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
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
  rewardXpSpent: {
    fontSize: "22px", fontWeight: 900,
    color: "#f87171",
    letterSpacing: "1px",
    textShadow: "0 0 20px rgba(239,68,68,0.4)",
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
