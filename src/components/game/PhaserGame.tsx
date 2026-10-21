"use client";

import { useEffect, useRef } from "react";
import type { GymSceneInitData } from "@/lib/game/scenes/GymScene";

export interface PhaserGameProps {
  initData: GymSceneInitData;
  onReady?: () => void;
}

/** Logical canvas width every scene is laid out against. */
const LOGICAL_WIDTH = 480;
/** The gym floor plan (back wall, 4×4 equipment grid, lounge, entrance) needs this much height. */
const MIN_LOGICAL_HEIGHT = 800;

// Lazy import — Phaser is large, only loaded client-side
let phaserInstance: import("phaser").Game | null = null;

export function PhaserGame({ initData, onReady }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);

  useEffect(() => {
    if (gameRef.current) return; // already mounted

    let mounted = true;

    const bootstrap = async () => {
      // Dynamic import keeps Phaser out of the SSR bundle
      const Phaser = (await import("phaser")).default;
      const { BootScene } = await import("@/lib/game/scenes/BootScene");
      const { GymScene } = await import("@/lib/game/scenes/GymScene");
      const { HomeScene } = await import("@/lib/game/scenes/HomeScene");
      const { WorkoutScene } = await import("@/lib/game/scenes/WorkoutScene");

      if (!mounted || !containerRef.current) return;

      const container = containerRef.current;
      const w = container.clientWidth || LOGICAL_WIDTH;
      const h = container.clientHeight || MIN_LOGICAL_HEIGHT;

      // Every scene lays out in a fixed 480-wide logical space. The height
      // follows the container's aspect so FIT fills a phone screen edge to edge,
      // but never drops below what the gym floor needs. Sizing the canvas to the
      // raw container instead pushed the right-hand equipment off narrow phones
      // and bunched everything into a corner on wide desktops.
      const logicalHeight = Math.max(MIN_LOGICAL_HEIGHT, Math.round((LOGICAL_WIDTH * h) / w));

      const config: import("phaser").Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: LOGICAL_WIDTH,
        height: logicalHeight,
        backgroundColor: "#0d1117",
        parent: container,
        scene: [BootScene, GymScene, HomeScene, WorkoutScene],
        // The game uses its own Web Audio-based AudioManager for all SFX —
        // Phaser's built-in sound manager is unused but, left enabled, still
        // creates its own AudioContext and binds visibilitychange handlers
        // that throw "Cannot suspend/resume a closed AudioContext" once the
        // game is destroyed (scene switch, unmount, Fast Refresh).
        audio: { noAudio: true },
        physics: { default: "arcade", arcade: { debug: false } },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        render: {
          antialias: true,
          pixelArt: false,
        },
        input: {
          activePointers: 3,
        },
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;
      phaserInstance = game;

      // Pass init data once BootScene transitions to GymScene
      game.events.once("ready", () => {
        game.scene.getScene("GymScene")?.scene.settings.data;
        onReady?.();
      });

      // Pass initData to registry so scenes can read it
      game.registry.set("playerData", initData);
      game.events.once("step", () => {
        game.registry.set("playerData", initData);
      });
    };

    bootstrap();

    return () => {
      mounted = false;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        phaserInstance = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      id="phaser-container"
      style={{
        width: "100%",
        height: "100%",
        minHeight: "100dvh",
        position: "relative",
        overflow: "hidden",
        background: "#0d1117",
      }}
    />
  );
}

// Expose for EventBridge use
export function getPhaserGame() {
  return phaserInstance;
}
