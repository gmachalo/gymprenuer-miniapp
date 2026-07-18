import Phaser from "phaser";
import { EventBus } from "@/lib/game/EventBus";
import { AudioManager } from "@/lib/game/systems/AudioManager";

// Premium first-person mirror workout scene
export class WorkoutScene extends Phaser.Scene {
  private repCount = 0;
  private targetReps = 12;
  private formAccuracy = 80;
  private heartRate = 120;
  private effortPct = 0;
  private intensity: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
  private equipmentId = "";
  private xpReward = 12;
  private tokenReward = 5;

  // UI
  private repText!: Phaser.GameObjects.Text;
  private repLabel!: Phaser.GameObjects.Text;
  private formBarFill!: Phaser.GameObjects.Graphics;
  private effortBarFill!: Phaser.GameObjects.Graphics;
  private hrText!: Phaser.GameObjects.Text;
  private hrPulse!: Phaser.GameObjects.Arc;
  private mirrorChar!: Phaser.GameObjects.Text;
  private mirrorReflection!: Phaser.GameObjects.Text;
  private tapZone!: Phaser.GameObjects.Rectangle;
  private tapRipple!: Phaser.GameObjects.Arc;
  private tapFlash!: Phaser.GameObjects.Rectangle;
  private comboText!: Phaser.GameObjects.Text;
  private combo = 0;
  private formOscDir = 1;
  private formOscTimer = 0;
  private workoutTimer = 0;
  private totalDuration = 0;
  private doneButton!: Phaser.GameObjects.Container;
  private isComplete = false;
  private screenVignette!: Phaser.GameObjects.Rectangle;
  private breathTimer = 0;
  private breathDir = 1;
  private hrLine!: Phaser.GameObjects.Graphics;
  private hrPoints: number[] = [];
  private hrUpdateTimer = 0;
  private comboFireLeft!: Phaser.GameObjects.Particles.ParticleEmitter;
  private comboFireRight!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sweepTimer = 0;
  private timerArc!: Phaser.GameObjects.Graphics;
  private progressTimer = 0;

  constructor() {
    super({ key: "WorkoutScene" });
  }

  init(data: {
    equipmentId?: string;
    intensity?: "LOW" | "MEDIUM" | "HIGH";
    xpReward?: number;
    tokenReward?: number;
  }) {
    this.equipmentId   = data.equipmentId ?? "";
    this.intensity     = data.intensity ?? "MEDIUM";
    this.xpReward      = data.xpReward ?? 12;
    this.tokenReward   = data.tokenReward ?? 5;
    this.repCount      = 0;
    this.combo         = 0;
    this.formAccuracy  = 80;
    this.effortPct     = 0;
    this.isComplete    = false;
    this.targetReps    = this.intensity === "HIGH" ? 15 : this.intensity === "LOW" ? 8 : 12;
    this.totalDuration = this.intensity === "HIGH" ? 25_000 : this.intensity === "LOW" ? 15_000 : 20_000;
    this.heartRate     = this.intensity === "HIGH" ? 145 : this.intensity === "LOW" ? 105 : 125;
    this.workoutTimer  = 0;
    this.hrPoints      = Array(24).fill(this.heartRate);
  }

  create() {
    const W  = this.scale.width;
    const H  = this.scale.height;
    const cx = W / 2;

    // ── Dark immersive background ──────────────────────────────────────────
    this.cameras.main.setBackgroundColor(0x030305);
    this.cameras.main.fadeIn(300, 3, 3, 5);

    const g = this.add.graphics();

    // ── Gym floor ─────────────────────────────────────────────────────────
    g.fillStyle(0x0a0a12).fillRect(0, H * 0.7, W, H * 0.3);
    // Floor reflection
    g.fillGradientStyle(0x6c47ff, 0x6c47ff, 0x000000, 0x000000, 0.04, 0.04, 0, 0);
    g.fillRect(0, H * 0.7, W, H * 0.08);
    // Floor grid lines
    g.lineStyle(1, 0x1a1a2e, 0.5);
    for (let x = 0; x < W; x += 40) g.lineBetween(x, H * 0.7, x, H);
    g.lineBetween(0, H * 0.75, W, H * 0.75);
    // Baseboard neon
    g.fillStyle(0x6c47ff, 0.15).fillRect(0, H * 0.7 - 2, W, 3);

    // ── Premium mirror frame ───────────────────────────────────────────────
    const mw = W * 0.58, mh = H * 0.52;
    const mx = cx - mw / 2, my = 36;
    // Outer frame shadow
    g.fillStyle(0x000000, 0.5).fillRoundedRect(mx - 6, my - 6, mw + 12, mh + 12, 12);
    // Mirror glass
    g.fillStyle(0x0d1525, 1).fillRoundedRect(mx, my, mw, mh, 8);
    // Glass blue tint
    g.fillStyle(0x1a2a4a, 0.25).fillRoundedRect(mx, my, mw, mh, 8);
    // Frame
    g.lineStyle(3, 0x6c47ff, 0.7).strokeRoundedRect(mx, my, mw, mh, 8);
    g.lineStyle(1, 0xa78bfa, 0.3).strokeRoundedRect(mx + 3, my + 3, mw - 6, mh - 6, 6);
    // Mirror sheen (diagonal highlight)
    g.fillStyle(0xffffff, 0.04).fillTriangle(mx + 2, my + 2, mx + mw * 0.35, my + 2, mx + 2, my + mh * 0.45);
    // Corner gems
    const corners = [[mx, my], [mx + mw, my], [mx, my + mh], [mx + mw, my + mh]];
    corners.forEach(([cx2, cy2]) => {
      g.fillStyle(0x6c47ff, 0.9).fillCircle(cx2, cy2, 5);
      g.fillStyle(0xa78bfa, 0.6).fillCircle(cx2, cy2, 3);
    });
    // "MIRROR VIEW" label
    this.add.text(cx, my - 12, "MIRROR VIEW", {
      fontFamily: "Inter, sans-serif", fontSize: "8px",
      color: "#4a3880", letterSpacing: 4,
    }).setOrigin(0.5);

    // ── Character in mirror ───────────────────────────────────────────────
    const charY = my + mh * 0.55;
    this.mirrorChar = this.add.text(cx, charY, "🏋️", {
      fontSize: this.intensity === "HIGH" ? "56px" : "48px",
    }).setOrigin(0.5).setDepth(2);

    // Reflection (slightly darker + flipped emoji offset)
    this.mirrorReflection = this.add.text(cx + 2, charY + 6, "🏋️", {
      fontSize: this.intensity === "HIGH" ? "56px" : "48px",
    }).setOrigin(0.5).setDepth(1).setAlpha(0.12).setTint(0x4cc9f0);

    // Mirror char animation (workout pump)
    const pumpDur = this.intensity === "HIGH" ? 340 : this.intensity === "LOW" ? 560 : 440;
    this.tweens.add({
      targets: this.mirrorChar,
      y: charY - 16, scaleX: 1.18, scaleY: 0.88,
      duration: pumpDur, yoyo: true, repeat: -1,
      ease: "Sine.easeInOut",
    });

    // ── Screen vignette overlay ──────────────────────────────────────────
    this.screenVignette = this.add.rectangle(cx, H / 2, W, H, 0x000000, 0).setDepth(50);

    // ── Tap flash overlay ────────────────────────────────────────────────
    this.tapFlash = this.add.rectangle(cx, H / 2, W, H, 0xffffff, 0).setDepth(49);

    // ── HUD panel background ─────────────────────────────────────────────
    const hudY = H * 0.615;
    g.fillStyle(0x0d0d18, 0.97).fillRoundedRect(12, hudY, W - 24, H - hudY - 12, 12);
    g.lineStyle(1, 0x2a2a4a, 0.8).strokeRoundedRect(12, hudY, W - 24, H - hudY - 12, 12);

    // ── Rep counter ───────────────────────────────────────────────────────
    this.add.text(cx - 80, hudY + 14, "REPS", {
      fontFamily: "Inter, sans-serif", fontSize: "8px",
      color: "#4a4468", letterSpacing: 3,
    }).setOrigin(0.5);
    this.repText = this.add.text(cx - 80, hudY + 36, `0`, {
      fontFamily: "Inter, sans-serif", fontSize: "32px", fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(0.5);
    this.repLabel = this.add.text(cx - 80, hudY + 56, `/ ${this.targetReps}`, {
      fontFamily: "Inter, sans-serif", fontSize: "12px",
      color: "#4a4468",
    }).setOrigin(0.5);

    // ── Heart rate with animated ECG ──────────────────────────────────────
    this.add.text(cx + 80, hudY + 14, "BPM", {
      fontFamily: "Inter, sans-serif", fontSize: "8px",
      color: "#4a4468", letterSpacing: 3,
    }).setOrigin(0.5);
    this.hrText = this.add.text(cx + 80, hudY + 36, `${this.heartRate}`, {
      fontFamily: "Inter, sans-serif", fontSize: "28px", fontStyle: "bold",
      color: "#ef4444",
    }).setOrigin(0.5);
    this.hrPulse = this.add.arc(cx + 80, hudY + 14, 5, 0, 360, false, 0xef4444, 0.6);
    // ECG line graphic
    this.hrLine = this.add.graphics().setDepth(3);

    // ── Progress ring (circular timer) ────────────────────────────────────
    this.timerArc = this.add.graphics().setDepth(3);
    g.fillStyle(0x1a1a2e, 0.6).fillCircle(cx, hudY + 35, 18);

    // ── Form accuracy bar ─────────────────────────────────────────────────
    const barY1 = hudY + 76;
    this.add.text(cx, barY1 - 10, "FORM", {
      fontFamily: "Inter, sans-serif", fontSize: "8px",
      color: "#4a4468", letterSpacing: 3,
    }).setOrigin(0.5);
    const formBg = this.add.graphics();
    formBg.fillStyle(0x1a1a2e, 0.9).fillRoundedRect(cx - 80, barY1, 160, 7, 4);
    this.formBarFill = this.add.graphics();

    // ── Effort bar ────────────────────────────────────────────────────────
    const barY2 = barY1 + 22;
    this.add.text(cx, barY2 - 10, "EFFORT", {
      fontFamily: "Inter, sans-serif", fontSize: "8px",
      color: "#4a4468", letterSpacing: 3,
    }).setOrigin(0.5);
    const effortBg = this.add.graphics();
    effortBg.fillStyle(0x1a1a2e, 0.9).fillRoundedRect(cx - 80, barY2, 160, 7, 4);
    this.effortBarFill = this.add.graphics();

    // ── Tap zone ──────────────────────────────────────────────────────────
    const tapY = barY2 + 34;
    this.tapZone = this.add.rectangle(cx, tapY, W - 48, 50, 0x6c47ff, 0.1)
      .setInteractive()
      .setStrokeStyle(1, 0x6c47ff, 0.4)
      .setRounded(10);
    this.add.text(cx, tapY - 8, "TAP TO REP", {
      fontFamily: "Inter, sans-serif", fontSize: "11px", fontStyle: "bold",
      color: "#6c47ff",
    }).setOrigin(0.5);
    this.add.text(cx, tapY + 8, "hold for max effort", {
      fontFamily: "Inter, sans-serif", fontSize: "9px",
      color: "#3d2f6a",
    }).setOrigin(0.5);

    this.tapRipple = this.add.arc(cx, tapY, 0, 0, 360, false, 0x6c47ff, 0.5).setDepth(10);

    // ── Combo text ────────────────────────────────────────────────────────
    this.comboText = this.add.text(cx, tapY - 44, "", {
      fontFamily: "Inter, sans-serif", fontSize: "16px", fontStyle: "bold",
      color: "#ffd700", stroke: "#000", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);

    // ── Combo fire particles (hidden until combo >= 5) ────────────────────
    this.comboFireLeft = this.add.particles(cx - 60, tapY - 20, "particle_dot", {
      speedX: { min: -20, max: 0 },
      speedY: { min: -60, max: -20 },
      scale: { start: 0.8, end: 0 },
      tint: [0xff6600, 0xff9900, 0xffcc00],
      alpha: { start: 0.9, end: 0 },
      lifespan: 500,
      frequency: 60,
      quantity: 2,
    });
    this.comboFireLeft.setDepth(15).stop();

    this.comboFireRight = this.add.particles(cx + 60, tapY - 20, "particle_dot", {
      speedX: { min: 0, max: 20 },
      speedY: { min: -60, max: -20 },
      scale: { start: 0.8, end: 0 },
      tint: [0xff6600, 0xff9900, 0xffcc00],
      alpha: { start: 0.9, end: 0 },
      lifespan: 500,
      frequency: 60,
      quantity: 2,
    });
    this.comboFireRight.setDepth(15).stop();

    // ── Back button ───────────────────────────────────────────────────────
    const backBtn = this.add.text(20, 16, "‹ BACK", {
      fontFamily: "Inter, sans-serif", fontSize: "10px",
      color: "#4a4468", backgroundColor: "#0d0d1888",
      padding: { x: 8, y: 4 },
    }).setInteractive().setDepth(60);
    backBtn.on("pointerdown", () => this.exitScene(false));
    backBtn.on("pointerover", () => backBtn.setColor("#a78bfa"));
    backBtn.on("pointerout",  () => backBtn.setColor("#4a4468"));

    // ── Done button ───────────────────────────────────────────────────────
    this.doneButton = this.add.container(cx, tapY).setAlpha(0).setDepth(60);
    const doneBg = this.add.graphics();
    doneBg.fillStyle(0x00d4aa, 1).fillRoundedRect(-100, -24, 200, 48, 12);
    doneBg.fillStyle(0xffffff, 0.15).fillRoundedRect(-100, -24, 200, 16, 12);
    doneBg.lineStyle(2, 0x5fffdd, 0.5).strokeRoundedRect(-100, -24, 200, 48, 12);
    const doneLabel = this.add.text(0, 0, "✅  FINISH WORKOUT", {
      fontFamily: "Inter, sans-serif", fontSize: "14px", fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(0.5);
    const doneHitArea = this.add.rectangle(0, 0, 200, 48, 0x000000, 0).setInteractive();
    this.doneButton.add([doneBg, doneLabel, doneHitArea]);
    doneHitArea.on("pointerdown", () => this.exitScene(true));

    // Inputs
    this.tapZone.on("pointerdown", () => this.onTap());
    this.input.keyboard?.on("keydown-SPACE", () => this.onTap());

    EventBus.emit("workout:firstperson_toggle", { enabled: true });
  }

  private drawBar(g: Phaser.GameObjects.Graphics, cx: number, y: number, pct: number, color: number) {
    const w = 160;
    g.clear();
    if (pct > 0) {
      g.fillStyle(color, 1).fillRoundedRect(cx - w / 2, y, w * pct, 7, 4);
      // Sheen
      g.fillStyle(0xffffff, 0.25).fillRoundedRect(cx - w / 2, y, w * pct, 3, 4);
    }
  }

  private drawECG() {
    const cx = this.scale.width / 2;
    const hudY = this.scale.height * 0.615;
    const bx = cx + 46, by = hudY + 56, bw = 68, bh = 18;

    this.hrLine.clear();
    this.hrLine.lineStyle(1.5, 0xef4444, 0.8);
    this.hrLine.beginPath();

    const pts = this.hrPoints.slice(-24);
    const step = bw / (pts.length - 1);
    const mid = by + bh / 2;
    const amp = bh * 0.45;

    pts.forEach((v, i) => {
      const x = bx + i * step;
      const norm = (v - 60) / 140; // 60–200 BPM range
      const y2 = mid - norm * amp;
      if (i === 0) this.hrLine.moveTo(x, y2);
      else this.hrLine.lineTo(x, y2);
    });
    this.hrLine.strokePath();

    // Scan line
    this.hrLine.lineStyle(1, 0xef4444, 0.3);
    const scanX = bx + (bw * ((Date.now() % 2000) / 2000));
    this.hrLine.lineBetween(scanX, by, scanX, by + bh);
  }

  private drawTimerArc() {
    const cx = this.scale.width / 2;
    const hudY = this.scale.height * 0.615;
    const pct = Math.min(1, this.workoutTimer / this.totalDuration);

    this.timerArc.clear();
    this.timerArc.lineStyle(3, 0x1a1a2e, 0.8);
    this.timerArc.strokeCircle(cx, hudY + 35, 18);
    if (pct > 0) {
      const endAngle = -Math.PI / 2 + pct * Math.PI * 2;
      const color = pct > 0.8 ? 0x00d4aa : 0x6c47ff;
      this.timerArc.lineStyle(3, color, 0.9);
      this.timerArc.beginPath();
      this.timerArc.arc(cx, hudY + 35, 18, -Math.PI / 2, endAngle, false);
      this.timerArc.strokePath();
    }
  }

  private onTap() {
    if (this.isComplete) return;
    this.repCount++;
    this.combo++;
    this.effortPct = Math.min(1, this.effortPct + 0.1);

    // Audio feedback
    AudioManager.playRepTap();
    if (this.combo >= 3) AudioManager.playCombo(this.combo);

    this.repText.setText(`${this.repCount}`);

    // Tap flash
    this.tapFlash.setAlpha(0.06);
    this.tweens.add({ targets: this.tapFlash, alpha: 0, duration: 150 });

    // Ripple
    this.tapRipple.setRadius(0).setAlpha(0.7);
    this.tweens.add({
      targets: this.tapRipple, radius: 80, alpha: 0,
      duration: 450, ease: "Cubic.easeOut",
    });

    // Rep pop animation
    this.tweens.add({
      targets: this.repText,
      scaleX: 1.35, scaleY: 1.35,
      duration: 100, yoyo: true, ease: "Back.easeOut",
    });

    // Mirror char pump emphasis
    this.tweens.add({
      targets: this.mirrorChar,
      scaleX: 1.25, scaleY: 0.82,
      duration: 90, yoyo: true, ease: "Sine.easeOut",
    });

    // HR rises
    this.heartRate = Math.min(195, this.heartRate + Phaser.Math.Between(1, 3));
    this.hrText.setText(`${this.heartRate}`);
    this.hrPulse.setScale(1.5);
    this.tweens.add({ targets: this.hrPulse, scaleX: 1, scaleY: 1, duration: 200 });

    // Combo
    if (this.combo >= 3) {
      this.formAccuracy = Math.min(100, this.formAccuracy + 2.5);
      const label = this.combo >= 10
        ? `🔥🔥 x${this.combo} MEGA!`
        : this.combo >= 5
        ? `🔥 x${this.combo} ON FIRE!`
        : `✦ x${this.combo} COMBO`;
      this.comboText.setText(label).setAlpha(1);
      this.tweens.add({ targets: this.comboText, alpha: 0, delay: 900, duration: 350 });

      // Fire particles at combo 5+
      if (this.combo >= 5) {
        this.comboFireLeft.start();
        this.comboFireRight.start();
        // Stop after 1s
        this.time.delayedCall(1000, () => {
          this.comboFireLeft.stop();
          this.comboFireRight.stop();
        });
      }
    }

    // Check completion
    if (this.repCount >= this.targetReps) this.completeWorkout();
  }

  private completeWorkout() {
    this.isComplete = true;
    this.tweens.add({ targets: this.doneButton, alpha: 1, scaleX: 1, scaleY: 1, duration: 500, ease: "Back.easeOut" });
    this.tweens.killTweensOf(this.mirrorChar);
    this.mirrorChar.setText("🏆");
    this.mirrorReflection.setText("🏆");
    // Victory flash
    this.cameras.main.flash(400, 108, 71, 255);
    this.cameras.main.shake(200, 0.005);
    // Completion particles burst
    this.add.particles(this.scale.width / 2, this.scale.height * 0.45, "particle_xp", {
      lifespan: 1200,
      speedX: { min: -120, max: 120 },
      speedY: { min: -150, max: -30 },
      scale: { start: 1.5, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 20, duration: 200,
    }).setDepth(100);
  }

  private exitScene(success: boolean) {
    if (success) {
      const bonus = this.combo >= 5 ? Math.ceil(this.xpReward * 0.2) : 0;
      EventBus.emit("workout:complete", {
        equipmentId:  this.equipmentId,
        xpEarned:     this.xpReward + bonus,
        tokensEarned: this.tokenReward,
      });
    }
    this.cameras.main.fadeOut(300, 3, 3, 5);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      EventBus.emit("workout:firstperson_toggle", { enabled: false });
      this.scene.stop("WorkoutScene");
      this.scene.resume("GymScene");
      this.scene.resume("HomeScene");
    });
  }

  update(_time: number, delta: number) {
    if (this.isComplete) return;
    this.workoutTimer += delta;
    this.progressTimer += delta;

    // Form oscillates — tap to maintain it
    this.formOscTimer += delta;
    if (this.formOscTimer > 700) {
      this.formOscTimer = 0;
      this.formAccuracy = Math.max(15, this.formAccuracy - 4 * this.formOscDir);
      if (this.formAccuracy <= 15) this.formOscDir = -1;
      else if (this.formAccuracy >= 100) this.formOscDir = 1;
    }
    this.effortPct = Math.max(0, this.effortPct - 0.0004 * delta);

    const cx = this.scale.width / 2;
    const hudY = this.scale.height * 0.615;

    this.drawBar(this.formBarFill, cx, hudY + 76, this.formAccuracy / 100, 0x00d4aa);
    this.drawBar(this.effortBarFill, cx, hudY + 98, this.effortPct, 0x6c47ff);

    // ECG update
    this.hrUpdateTimer += delta;
    if (this.hrUpdateTimer > 140) {
      this.hrUpdateTimer = 0;
      this.heartRate += Phaser.Math.Between(-1, 2);
      this.heartRate = Phaser.Math.Clamp(this.heartRate, 90, 195);
      this.hrPoints.push(this.heartRate);
      if (this.hrPoints.length > 30) this.hrPoints.shift();
      this.hrText.setText(`${this.heartRate}`);
    }
    this.drawECG();
    this.drawTimerArc();

    // Breathing vignette
    this.breathTimer += delta;
    if (this.breathTimer > 60) {
      this.breathTimer = 0;
      const targetAlpha = this.intensity === "HIGH" ? 0.18 : 0.1;
      const va = this.screenVignette.alpha + this.breathDir * 0.002;
      if (va >= targetAlpha || va <= 0) this.breathDir *= -1;
      this.screenVignette.setAlpha(Math.max(0, va));
    }

    // Tap zone pulse
    this.sweepTimer += delta;
    const tapPulse = 0.08 + Math.sin(this.sweepTimer * 0.003) * 0.04;
    this.tapZone.setFillStyle(0x6c47ff, tapPulse);
  }
}
