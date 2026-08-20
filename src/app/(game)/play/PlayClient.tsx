"use client";

import dynamic from "next/dynamic";
import { GameHUD } from "@/components/game/GameHUD";
import type { GymSceneInitData } from "@/lib/game/scenes/GymScene";

// Phaser must never run on server — dynamic import with ssr:false
const PhaserGame = dynamic(
  () => import("@/components/game/PhaserGame").then((m) => m.PhaserGame),
  { ssr: false, loading: () => <GameLoadingScreen /> }
);

interface PlayClientProps {
  initData: GymSceneInitData;
  playerName: string;
  currentXp: number;
  overflowXp: number;
  restUntil: string | null;
  lastXpRegenAt: string;
  offChainTokens: number;
  level: number;
  streakCount: number;
  gymName?: string;
  hasGym: boolean;
}

export function PlayClient({
  initData,
  playerName,
  currentXp,
  overflowXp,
  restUntil,
  lastXpRegenAt,
  offChainTokens,
  level,
  streakCount,
  gymName,
  hasGym,
}: PlayClientProps) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden", background: "#0d1117" }}>
      {/* Phaser canvas fills the screen */}
      <PhaserGame initData={initData} />

      {/* React HUD overlaid on top */}
      <GameHUD
        playerName={playerName}
        initialXp={currentXp}
        initialOverflow={overflowXp}
        initialRestUntil={restUntil}
        initialLastRegenAt={lastXpRegenAt}
        initialTokens={offChainTokens}
        initialLevel={level}
        streakCount={streakCount}
        gymName={gymName}
        hasGym={hasGym}
      />
    </div>
  );
}

function GameLoadingScreen() {
  return (
    <div style={{
      width: "100%", height: "100dvh",
      background: "#0d1117",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "20px",
    }}>
      <div style={{ fontSize: "64px", animation: "spin-slow 2s linear infinite" }}>🏋️</div>
      <div style={{ fontSize: "16px", color: "#a78bfa", fontWeight: 700 }}>Loading Gym Tycoon...</div>
      <div style={{
        width: "200px", height: "4px",
        background: "#1e2030", borderRadius: "99px", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: "60%",
          background: "linear-gradient(90deg,#6c47ff,#00d4aa)",
          borderRadius: "99px",
          animation: "loading-bar 1.5s ease-in-out infinite",
        }} />
      </div>
      <style>{`
        @keyframes spin-slow { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes loading-bar {
          0%{width:0%;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0%;margin-left:100%}
        }
      `}</style>
    </div>
  );
}
