// EventBus — Phaser ↔ React bridge using mitt
// Import this in both Phaser scenes and React components

import mitt from "mitt";

export type GameEvents = {
  // XP / progress
  "player:xp_changed": { currentXp: number; overflowXp: number; restUntil: string | null };
  "player:level_up":   { newLevel: number };
  "player:exhausted":  { restUntil: string | null };

  // Boosts
  "boost:activated": { multiplier: number; durationMs: number };
  "boost:expired":   Record<string, never>;

  // Income
  "income:collected": { amount: number; x: number; y: number };
  "income:ready":     { zoneId: string; amount: number };
  "income:tick":      { amount: number; pendingTotal: number };

  // NPCs
  "npc:entered":           { npcId: string };
  "npc:paid":              { amount: number };
  "npc:left_dissatisfied": { npcId: string };

  // Workouts
  "workout:started":           { equipmentId: string; intensity: "LOW" | "MEDIUM" | "HIGH" };
  "workout:complete":          { xpEarned: number; tokensEarned: number; equipmentId: string };
  "workout:quit":              { equipmentId: string };
  "workout:firstperson_toggle": { enabled: boolean };

  // Equipment
  "equipment:interact":  { equipmentId: string; name: string; xpCost: number };
  "equipment:upgraded":  { equipmentId: string; newLevel: number };

  // Scene control
  "scene:switch": { to: "GymScene" | "HomeScene" | "WorkoutScene" };
  "scene:ready":  { name: string };

  // HUD actions (React → Phaser)
  "hud:upgrade_requested": { equipmentId: string };
  "hud:collect_income":    void;
  "hud:quit_workout":      void;
};

export const EventBus = mitt<GameEvents>();
