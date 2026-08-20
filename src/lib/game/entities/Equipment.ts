import Phaser from "phaser";
import { EventBus } from "@/lib/game/EventBus";

export interface EquipmentConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  id: string;
  name: string;
  textureKey: string;
  xpCost: number;
  xpReward: number;
  tokenReward: number;
  intensity: "LOW" | "MEDIUM" | "HIGH";
  level?: number;
}

const INTENSITY_COLOR: Record<string, number> = {
  LOW:    0x00d4aa,
  MEDIUM: 0x6c47ff,
  HIGH:   0xef4444,
};

export class Equipment extends Phaser.GameObjects.Container {
  readonly equipId: string;
  readonly equipName: string;
  readonly xpCost: number;
  readonly xpReward: number;
  readonly tokenReward: number;
  readonly intensity: "LOW" | "MEDIUM" | "HIGH";
  level: number;
  isOccupied = false;
  interactionZone: Phaser.Geom.Circle;

  private sprite: Phaser.GameObjects.Image;
  private labelText: Phaser.GameObjects.Text;
  private progressBarBg: Phaser.GameObjects.Graphics;
  private progressBarFill: Phaser.GameObjects.Graphics;
  private progressPct = 0;
  private workoutTimer = 0;
  private workoutDuration = 0;
  private promptContainer!: Phaser.GameObjects.Container;
  private glowRing: Phaser.GameObjects.Arc;
  private glowPulse: Phaser.GameObjects.Arc;
  private occupiedBadge!: Phaser.GameObjects.Container;
  private levelBadge: Phaser.GameObjects.Text;
  private isPromptVisible = false;

  constructor(config: EquipmentConfig) {
    super(config.scene, config.x, config.y);

    this.equipId      = config.id;
    this.equipName    = config.name;
    this.xpCost       = config.xpCost;
    this.xpReward     = config.xpReward;
    this.tokenReward  = config.tokenReward;
    this.intensity    = config.intensity;
    this.level        = config.level ?? 1;
    this.interactionZone = new Phaser.Geom.Circle(config.x, config.y, 64);

    const accentColor = INTENSITY_COLOR[config.intensity] ?? 0x6c47ff;

    // ── Outer glow pulse (very subtle) ──────────────────────────────────────
    this.glowPulse = config.scene.add.arc(0, 0, 52, 0, 360, false, accentColor, 0).setDepth(-2);
    this.add(this.glowPulse);

    // ── Inner proximity glow ring ────────────────────────────────────────────
    this.glowRing = config.scene.add.arc(0, 0, 40, 0, 360, false, accentColor, 0).setDepth(-1);
    this.add(this.glowRing);

    // ── Equipment sprite ─────────────────────────────────────────────────────
    this.sprite = config.scene.add.image(0, 0, config.textureKey).setScale(0.92);
    this.add(this.sprite);

    // ── Level badge ──────────────────────────────────────────────────────────
    this.levelBadge = config.scene.add
      .text(28, -30, `Lv.${this.level}`, {
        fontFamily: "Inter, sans-serif", fontSize: "7px", fontStyle: "bold",
        color: "#ffffff", backgroundColor: "#6c47ffcc",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setAlpha(0.7);
    this.add(this.levelBadge);

    // ── Equipment name label ─────────────────────────────────────────────────
    this.labelText = config.scene.add
      .text(0, 40, config.name, {
        fontFamily: "Inter, sans-serif",
        fontSize: "8px",
        color: "#6a6a88",
        backgroundColor: "#00000055",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);
    this.add(this.labelText);

    // ── Interaction prompt (hidden until nearby) ─────────────────────────────
    this.buildPrompt(accentColor);

    // ── Progress bar ─────────────────────────────────────────────────────────
    this.progressBarBg = config.scene.add.graphics();
    this.progressBarFill = config.scene.add.graphics();
    this.add(this.progressBarBg);
    this.add(this.progressBarFill);

    // ── Occupied badge ───────────────────────────────────────────────────────
    this.buildOccupiedBadge(accentColor);

    config.scene.add.existing(this);
    this.setDepth(config.y);

    // Ambient idle bob (subtle)
    config.scene.tweens.add({
      targets: this.sprite,
      y: -2, duration: 1800 + Math.random() * 600,
      yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });

    // Gentle glow pulse (always running at low alpha)
    config.scene.tweens.add({
      targets: this.glowPulse,
      fillAlpha: 0.06, scaleX: 1.1, scaleY: 1.1,
      duration: 2200 + Math.random() * 800,
      yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
  }

  private buildPrompt(accentColor: number) {
    this.promptContainer = this.scene.add.container(0, -58);

    // Background pill
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95).fillRoundedRect(-52, -12, 104, 22, 8);
    bg.lineStyle(1, accentColor, 0.5).strokeRoundedRect(-52, -12, 104, 22, 8);

    // Cost/reward text
    const text = this.scene.add.text(0, 0, `⚡${this.xpCost} → +${this.xpReward}XP  +${this.tokenReward}🪙`, {
      fontFamily: "Inter, sans-serif", fontSize: "9px",
      color: "#c4b5fd",
    }).setOrigin(0.5);

    // Intensity dot
    const intensityColors: Record<string, string> = { LOW: "#00d4aa", MEDIUM: "#a78bfa", HIGH: "#ef4444" };
    const dot = this.scene.add.text(-46, 0, "●", {
      fontSize: "8px", color: intensityColors[this.intensity],
    }).setOrigin(0.5);

    // Arrow down
    const arrow = this.scene.add.text(0, 14, "▼", {
      fontSize: "8px", color: "#6c47ff66",
    }).setOrigin(0.5);

    this.promptContainer.add([bg, text, dot, arrow]);
    this.promptContainer.setAlpha(0);
    this.add(this.promptContainer);
  }

  private buildOccupiedBadge(accentColor: number) {
    this.occupiedBadge = this.scene.add.container(0, -46);
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.9).fillRoundedRect(-28, -9, 56, 16, 6);
    bg.lineStyle(1, accentColor, 0.6).strokeRoundedRect(-28, -9, 56, 16, 6);
    const label = this.scene.add.text(0, 0, "💪 IN USE", {
      fontFamily: "Inter, sans-serif", fontSize: "8px", fontStyle: "bold",
      color: "#00d4aa",
    }).setOrigin(0.5);
    this.occupiedBadge.add([bg, label]);
    this.occupiedBadge.setAlpha(0);
    this.add(this.occupiedBadge);
  }

  showPrompt(visible: boolean) {
    if (this.isOccupied) return;
    if (this.isPromptVisible === visible) return;
    this.isPromptVisible = visible;

    this.scene.tweens.add({
      targets: this.promptContainer,
      alpha: visible ? 1 : 0,
      scaleX: visible ? 1 : 0.85,
      scaleY: visible ? 1 : 0.85,
      duration: 200,
      ease: visible ? "Back.easeOut" : "Sine.easeIn",
    });
    this.scene.tweens.add({
      targets: this.glowRing,
      fillAlpha: visible ? 0.22 : 0,
      duration: 250,
    });
    // Proximity halo pulse
    if (visible) {
      this.scene.tweens.add({
        targets: this.glowPulse,
        fillAlpha: 0.18, scaleX: 1.25, scaleY: 1.25,
        duration: 400, yoyo: true, repeat: 2,
      });
    }
  }

  startWorkout(duration: number) {
    this.isOccupied = true;
    this.workoutTimer = 0;
    this.workoutDuration = duration;
    this.progressPct = 0;
    this.isPromptVisible = false;
    this.promptContainer.setAlpha(0);

    // Show occupied badge
    this.scene.tweens.add({
      targets: this.occupiedBadge,
      alpha: 1, duration: 250, ease: "Back.easeOut",
    });

    // Sprite activation bounce
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.05, scaleY: 1.08,
      duration: 180, yoyo: true,
      ease: "Back.easeOut",
    });

    // Workout pump animation
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 0.96,
      duration: 380 + (this.intensity === "HIGH" ? -80 : this.intensity === "LOW" ? 100 : 0),
      yoyo: true, repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Glow intensifies
    this.scene.tweens.add({
      targets: this.glowRing,
      fillAlpha: 0.3, duration: 300,
    });
  }

  updateWorkout(delta: number): boolean {
    if (!this.isOccupied) return false;
    this.workoutTimer += delta;
    this.progressPct = Math.min(1, this.workoutTimer / this.workoutDuration);

    this.drawProgressBar();

    if (this.progressPct >= 1) {
      this.finishWorkout();
      return true;
    }
    return false;
  }

  private drawProgressBar() {
    const w = 56;
    const y = -48;

    this.progressBarBg.clear();
    this.progressBarBg.fillStyle(0x111120, 0.9).fillRoundedRect(-w/2, y - 4, w, 8, 4);

    this.progressBarFill.clear();
    if (this.progressPct > 0) {
      const fillW = w * this.progressPct;
      // Gradient color: purple → teal as workout progresses
      const fillColor = this.progressPct > 0.8 ? 0x00d4aa : this.progressPct > 0.5 ? 0x4a90d9 : 0x6c47ff;
      this.progressBarFill.fillStyle(fillColor, 1).fillRoundedRect(-w/2, y - 4, fillW, 8, 4);
      // Sheen
      this.progressBarFill.fillStyle(0xffffff, 0.2).fillRoundedRect(-w/2, y - 4, fillW, 3, 4);
      // Percentage text (at end of bar)
      // (skipped for perf — the visual bar is sufficient)
    }
  }

  private resetAfterWorkout() {
    this.isOccupied = false;
    this.workoutTimer = 0;
    this.progressPct = 0;

    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(0.92);

    this.progressBarBg.clear();
    this.progressBarFill.clear();

    // Hide occupied badge
    this.scene.tweens.add({
      targets: this.occupiedBadge,
      alpha: 0, duration: 200,
    });
    // Glow back to idle
    this.scene.tweens.add({
      targets: this.glowRing,
      fillAlpha: 0, duration: 400,
    });
  }

  private finishWorkout() {
    this.resetAfterWorkout();

    // Completion flash — brief white tint
    this.sprite.setTint(0xffffff);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite?.active) this.sprite.clearTint();
    });

    EventBus.emit("workout:complete", {
      equipmentId:  this.equipId,
      xpEarned:     this.xpReward,
      tokensEarned: this.tokenReward,
    });
  }

  /** Cancel an in-progress workout early — no reward is granted or requested. */
  quitWorkout() {
    if (!this.isOccupied) return;
    this.resetAfterWorkout();

    // Fade flash (distinct from the completion tint) to signal a cancel, not a win
    this.sprite.setTint(0x888888);
    this.scene.time.delayedCall(150, () => {
      if (this.sprite?.active) this.sprite.clearTint();
    });

    EventBus.emit("workout:quit", { equipmentId: this.equipId });
  }

  upgrade() {
    this.level++;
    this.levelBadge.setText(`Lv.${this.level}`);

    // Upgrade burst animation
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.25, scaleY: 1.25,
      duration: 200, yoyo: true,
      ease: "Back.easeOut",
    });

    // Flash gold
    this.sprite.setTint(0xffd700);
    this.scene.time.delayedCall(300, () => {
      if (this.sprite?.active) this.sprite.clearTint();
    });

    EventBus.emit("equipment:upgraded", { equipmentId: this.equipId, newLevel: this.level });
  }
}
