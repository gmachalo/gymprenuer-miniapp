import Phaser from "phaser";
import { Player } from "@/lib/game/entities/Player";
import { PlayerController } from "@/lib/game/systems/PlayerController";
import { Equipment } from "@/lib/game/entities/Equipment";
import { NpcManager } from "@/lib/game/systems/NpcManager";
import { IncomeSystem } from "@/lib/game/systems/IncomeSystem";
import { EventBus } from "@/lib/game/EventBus";

const GYM_EQUIPMENT: Array<{
  id: string; name: string; tex: string;
  x: number; y: number;
  xpCost: number; xpReward: number; tokens: number;
  intensity: "LOW" | "MEDIUM" | "HIGH";
}> = [
  { id: "bench",     name: "Bench Press", tex: "eq_bench",     x: 140, y: 200, xpCost: 10, xpReward: 15, tokens: 8,  intensity: "HIGH"   },
  { id: "treadmill", name: "Treadmill",   tex: "eq_treadmill", x: 280, y: 200, xpCost: 8,  xpReward: 12, tokens: 5,  intensity: "MEDIUM" },
  { id: "squat",     name: "Squat Rack",  tex: "eq_squat",     x: 420, y: 200, xpCost: 12, xpReward: 18, tokens: 10, intensity: "HIGH"   },
  { id: "cable",     name: "Cable Row",   tex: "eq_cable",     x: 140, y: 340, xpCost: 8,  xpReward: 12, tokens: 6,  intensity: "MEDIUM" },
  { id: "bike",      name: "Spin Bike",   tex: "eq_bike",      x: 280, y: 340, xpCost: 6,  xpReward: 10, tokens: 4,  intensity: "LOW"    },
];

export interface GymSceneInitData {
  playerBodyType?: "SKINNY" | "AVERAGE" | "OVERWEIGHT";
  playerName?: string;
  playerTransformationStage?: number;
  currentXp?: number;
  overflowXp?: number;
  gymReputation?: number;
}

export class GymScene extends Phaser.Scene {
  private player!: Player;
  private controller!: PlayerController;
  private equipment: Equipment[] = [];
  private npcManager!: NpcManager;
  private incomeSystem!: IncomeSystem;
  private camera!: Phaser.Cameras.Scene2D.Camera;
  private activeEquipment: Equipment | null = null;
  private initData: GymSceneInitData = {};

  // Bound EventBus handler references — kept so shutdown() can remove exactly
  // these listeners (EventBus.off(type) with no handler clears ALL listeners
  // for that event, including AudioManager's and GameHUD's, so we must pass
  // the specific function reference here rather than the bare event name).
  private onNpcPaid = ({ amount }: { amount: number }) => {
    this.incomeSystem.spawnNpcPay(
      this.cashPoint.x + Phaser.Math.Between(-20, 20),
      this.cashPoint.y - 30,
      amount
    );
    this.tweens.add({ targets: this.cashGlow, fillAlpha: 0.5, duration: 300, yoyo: true });
  };

  private onWorkoutComplete = ({ xpEarned, tokensEarned, equipmentId }: { xpEarned: number; tokensEarned: number; equipmentId: string }) => {
    const eq = this.equipment.find((e) => e.equipId === equipmentId);
    if (eq) {
      this.incomeSystem.spawnXpReward(eq.x, eq.y - 40, xpEarned);
      this.incomeSystem.spawnTokenReward(eq.x + 20, eq.y - 20, tokensEarned);
      // Camera shake on completion
      this.camera.shake(120, 0.004);
      // Spawn completion particles
      this.spawnCompletionBurst(eq.x, eq.y - 20);
    }
    this.player.setPlayerState("IDLE");
    this.activeEquipment = null;
  };

  private onSceneSwitch = ({ to }: { to: "GymScene" | "HomeScene" | "WorkoutScene" }) => {
    if (to !== "GymScene") {
      // Fade out before switching
      this.cameras.main.fadeOut(250, 9, 9, 15);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start(to);
      });
    }
  };

  private onQuitWorkout = () => {
    if (!this.activeEquipment) return;
    this.activeEquipment.quitWorkout();
    this.activeEquipment = null;
    this.player.setPlayerState("IDLE");
  };

  // Income collection point
  private cashPoint!: Phaser.GameObjects.Container;
  private cashGlow!: Phaser.GameObjects.Arc;

  // Environment
  private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private backgroundLayer!: Phaser.GameObjects.Graphics;
  private clockHand!: Phaser.GameObjects.Line;
  private tvFlicker = 0;
  private tvScreen!: Phaser.GameObjects.Rectangle;
  private ambientLights: Phaser.GameObjects.Arc[] = [];
  private ambientLightTimer = 0;
  private neonSignText!: Phaser.GameObjects.Text;
  private neonFlicker = 0;

  constructor() {
    super({ key: "GymScene" });
  }

  init(data: GymSceneInitData) {
    this.initData = data;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // create() re-runs every time this scene is (re)started, but these arrays
    // are plain instance fields — Phaser only calls the class constructor once,
    // so without resetting them here they keep every equipment/light reference
    // from every previous session, including ones Phaser has since destroyed
    // (accessing a destroyed GameObject's `.scene` throws).
    this.equipment = [];
    this.ambientLights = [];
    this.activeEquipment = null;

    // ── Parallax background (city through windows) ───────────────────────────
    this.drawParallaxBackground(W, H);

    // ── Main gym layout ───────────────────────────────────────────────────────
    this.cameras.main.setBackgroundColor(0x09090f);
    this.drawGymLayout(W, H);

    // ── Gym props & decorations ───────────────────────────────────────────────
    this.addGymProps(W, H);

    // ── Zone labels ───────────────────────────────────────────────────────────
    this.addZoneLabel("⚡ WEIGHT ZONE", 260, 118);
    this.addZoneLabel("🏃 CARDIO ZONE", 220, 285);
    this.addZoneLabel("🧾 RECEPTION", 60, 435);

    // ── Equipment ─────────────────────────────────────────────────────────────
    GYM_EQUIPMENT.forEach((cfg) => {
      const eq = new Equipment({
        scene: this,
        x: cfg.x, y: cfg.y,
        id: cfg.id, name: cfg.name,
        textureKey: cfg.tex,
        xpCost: cfg.xpCost, xpReward: cfg.xpReward,
        tokenReward: cfg.tokens,
        intensity: cfg.intensity,
      });
      this.equipment.push(eq);
    });

    // ── Cash collection point ──────────────────────────────────────────────────
    this.cashPoint = this.add.container(80, H - 100);
    this.cashGlow = this.add.arc(0, 0, 32, 0, 360, false, 0xffd700, 0).setDepth(-1);
    const cashHalo = this.add.arc(0, 0, 44, 0, 360, false, 0xffd700, 0).setDepth(-2);
    const cashLabel = this.add.text(0, 20, "💰 COLLECT", {
      fontFamily: "Inter, sans-serif", fontSize: "9px",
      color: "#ffd700", backgroundColor: "#00000099",
      padding: { x: 4, y: 2 }, letterSpacing: 1,
    }).setOrigin(0.5);
    const cashIcon = this.add.image(0, 0, "income_indicator").setScale(2.0);
    this.cashPoint.add([cashHalo, this.cashGlow, cashIcon, cashLabel]);

    // Pulse halo
    this.tweens.add({
      targets: cashHalo,
      fillAlpha: 0.08,
      scaleX: 1.3, scaleY: 1.3,
      duration: 1200,
      yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });

    // ── Particle systems ──────────────────────────────────────────────────────
    this.setupParticles(W, H);

    // ── Player ────────────────────────────────────────────────────────────────
    this.player = new Player({
      scene: this,
      x: W / 2,
      y: H - 100,
      bodyType: this.initData.playerBodyType ?? "AVERAGE",
      name: this.initData.playerName ?? "You",
      transformationStage: this.initData.playerTransformationStage ?? 0,
    });

    // ── Camera ────────────────────────────────────────────────────────────────
    this.camera = this.cameras.main;
    this.camera.startFollow(this.player, true, 0.08, 0.08);
    this.camera.setZoom(1.0);

    // Smooth zoom on scroll / pinch
    this.input.on("wheel", (_: unknown, __: unknown, ___: unknown, dy: number) => {
      const target = Phaser.Math.Clamp(this.camera.zoom - dy * 0.001, 0.65, 2.0);
      this.tweens.add({ targets: this.camera, zoom: target, duration: 150, ease: "Sine.easeOut" });
    });

    // ── Player Controller ─────────────────────────────────────────────────────
    this.controller = new PlayerController(this, this.player);
    this.controller.onInteractCallback = (wx, wy) => this.tryInteract(wx, wy);

    // ── Systems ───────────────────────────────────────────────────────────────
    this.incomeSystem = new IncomeSystem(this);
    this.npcManager = new NpcManager(
      this,
      this.equipment,
      { x: W / 2, y: 30 },
      { x: W / 2, y: 30 },
      this.initData.gymReputation ?? 50
    );

    // ── EventBus listeners ────────────────────────────────────────────────────
    EventBus.on("npc:paid", this.onNpcPaid);
    EventBus.on("workout:complete", this.onWorkoutComplete);
    EventBus.on("scene:switch", this.onSceneSwitch);
    EventBus.on("hud:quit_workout", this.onQuitWorkout);

    // Fade in on scene start
    this.cameras.main.fadeIn(400, 9, 9, 15);
    EventBus.emit("scene:ready", { name: "GymScene" });

    // create() re-runs every time this scene is started, so the EventBus
    // listeners above must be torn down on shutdown or they pile up and
    // keep firing against this now-destroyed scene's game objects.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  // ── Parallax city background ────────────────────────────────────────────────
  private drawParallaxBackground(W: number, H: number) {
    const bg = this.add.graphics().setScrollFactor(0.15).setDepth(-10);

    // Sky gradient (deep purple → dark navy)
    bg.fillGradientStyle(0x0a0520, 0x0a0520, 0x0d1535, 0x0d1535, 1);
    bg.fillRect(0, 0, W, H * 0.4);

    // City building silhouettes (window-visible area)
    const buildingColors = [0x0e0e1a, 0x111120, 0x0c0c18];
    const buildings = [
      { x: 10, w: 30, h: 55 }, { x: 45, w: 20, h: 40 }, { x: 70, w: 35, h: 65 },
      { x: 110, w: 25, h: 50 }, { x: 140, w: 40, h: 70 }, { x: 185, w: 18, h: 38 },
      { x: 210, w: 30, h: 60 }, { x: 250, w: 22, h: 45 }, { x: 280, w: 38, h: 72 },
      { x: 325, w: 26, h: 52 }, { x: 360, w: 32, h: 58 }, { x: 400, w: 20, h: 42 },
    ];
    buildings.forEach((b, i) => {
      bg.fillStyle(buildingColors[i % 3], 1);
      bg.fillRect(b.x, H * 0.4 - b.h, b.w, b.h);
      // Lit windows
      for (let wy = b.h - 10; wy > 8; wy -= 10) {
        for (let wx = 4; wx < b.w - 4; wx += 8) {
          if (Math.random() > 0.55) {
            const winColor = Math.random() > 0.7 ? 0xffeedd : 0x88aaff;
            bg.fillStyle(winColor, 0.35);
            bg.fillRect(b.x + wx, H * 0.4 - wy - 2, 4, 5);
          }
        }
      }
    });

    // Moon / street glow
    bg.fillStyle(0xfff8e7, 0.08).fillCircle(W * 0.8, H * 0.1, 18);
    bg.fillStyle(0xfff8e7, 0.04).fillCircle(W * 0.8, H * 0.1, 28);
  }

  // ── Main gym floor & walls ─────────────────────────────────────────────────
  private drawGymLayout(W: number, H: number) {
    const g = this.add.graphics();

    // Outer dark background
    g.fillStyle(0x09090f).fillRect(0, 0, W, H);

    // Main workout floor
    g.fillStyle(0x14141e).fillRect(20, 20, W - 40, H * 0.57);

    // Subtle grid
    g.lineStyle(1, 0x1a1a28, 0.7);
    for (let x = 20; x < W; x += 44) g.lineBetween(x, 20, x, H * 0.57);
    for (let y = 20; y < H * 0.57; y += 44) g.lineBetween(20, y, W - 20, y);

    // Floor accent tiles (every other cell slightly lighter)
    g.fillStyle(0x16162a, 0.5);
    for (let x = 20; x < W - 20; x += 88) {
      for (let y = 20; y < H * 0.57; y += 88) {
        g.fillRect(x, y, 44, 44);
      }
    }

    // Reception area
    g.fillStyle(0x0f0d18).fillRect(20, H * 0.62, W * 0.38, H * 0.34);
    g.lineStyle(1, 0x1a1428, 0.5);
    for (let y = H * 0.62; y < H * 0.96; y += 24) g.lineBetween(20, y, W * 0.38 + 20, y);

    // Zone divider line
    g.lineStyle(2, 0x6c47ff, 0.25);
    g.lineBetween(22, H * 0.3, W - 22, H * 0.3);
    // Divider label glow
    g.fillStyle(0x6c47ff, 0.04).fillRect(22, H * 0.28, W - 44, 4);

    // Outer wall border with neon accent
    g.lineStyle(2, 0x6c47ff, 0.4).strokeRect(20, 20, W - 40, H * 0.57);
    // Inner border highlight
    g.lineStyle(1, 0x4a30cc, 0.2).strokeRect(22, 22, W - 44, H * 0.57 - 4);

    // Left mirror wall (reflective surface)
    g.fillStyle(0x1a2035, 0.55).fillRect(21, 24, 22, H * 0.55 - 10);
    // Mirror frame
    g.lineStyle(2, 0x4cc9f0, 0.45).strokeRect(21, 24, 22, H * 0.55 - 10);
    // Mirror sheen streak
    g.fillStyle(0xffffff, 0.05).fillRect(25, 28, 6, H * 0.55 - 18);
    g.fillStyle(0xffffff, 0.02).fillRect(29, 28, 3, H * 0.55 - 18);

    // Right accent wall
    g.fillStyle(0x6c47ff, 0.04).fillRect(W - 43, 24, 20, H * 0.55 - 10);
    g.lineStyle(1, 0x6c47ff, 0.2).strokeRect(W - 43, 24, 20, H * 0.55 - 10);

    // Floor baseboard glow (neon strip along floor border)
    g.fillStyle(0x6c47ff, 0.08).fillRect(20, H * 0.56, W - 40, 3);
    g.fillStyle(0x00d4aa, 0.06).fillRect(20, H * 0.62, W * 0.38, 2);
    this.backgroundLayer = g;
  }

  // ── Gym props ──────────────────────────────────────────────────────────────
  private addGymProps(W: number, H: number) {
    const g = this.add.graphics().setDepth(2);

    // ── Neon sign above entrance ───────────────────────────────────────────
    const signX = W / 2, signY = 32;
    this.add.image(signX, signY, "prop_sign_bg").setOrigin(0.5).setDepth(3);
    this.neonSignText = this.add.text(signX, signY, "💪 GYM TYCOON", {
      fontFamily: "Inter, sans-serif", fontSize: "11px", fontStyle: "bold",
      color: "#a78bfa", letterSpacing: 3,
    }).setOrigin(0.5).setDepth(4);

    // ── TV Screens ─────────────────────────────────────────────────────────
    const tvPositions = [
      { x: W - 44, y: 60 }, { x: W - 44, y: 130 },
    ];
    tvPositions.forEach((pos) => {
      this.add.image(pos.x, pos.y, "prop_tv").setOrigin(0.5).setDepth(3);
    });
    // Animated TV screen — store reference for update flicker
    this.tvScreen = this.add.rectangle(W - 44, 64, 42, 24, 0x00d4aa, 0.15).setDepth(4);

    // ── Water Cooler (reception area) ──────────────────────────────────────
    this.add.image(W * 0.35, H * 0.68, "prop_water").setOrigin(0.5).setDepth(3);
    // Water dispense drip tween
    const drip = this.add.arc(W * 0.35, H * 0.68 + 10, 2, 0, 360, false, 0x4cc9f0, 0.6).setDepth(4);
    this.tweens.add({
      targets: drip, y: H * 0.68 + 18,
      alpha: 0, duration: 1200, repeat: -1, delay: 3000,
    });

    // ── Motivational posters (right wall) ─────────────────────────────────
    const posters = [
      { x: W - 28, y: 80,  text: "NO PAIN\nNO GAIN", color: "#ef4444" },
      { x: W - 28, y: 160, text: "NEVER\nSKIP\nLEG DAY", color: "#f59e0b" },
    ];
    posters.forEach((p) => {
      g.fillStyle(0x1a1a2e, 1).fillRoundedRect(p.x - 16, p.y - 22, 32, 40, 3);
      g.lineStyle(1, 0x334, 0.5).strokeRoundedRect(p.x - 16, p.y - 22, 32, 40, 3);
      this.add.text(p.x, p.y, p.text, {
        fontFamily: "Inter, sans-serif", fontSize: "6px", fontStyle: "bold",
        color: p.color, align: "center", lineSpacing: 2,
      }).setOrigin(0.5).setDepth(3);
    });

    // ── Wall clock ────────────────────────────────────────────────────────
    const clockX = 54, clockY = 45;
    g.fillStyle(0x1a1a2e, 1).fillCircle(clockX, clockY, 14);
    g.lineStyle(1, 0x6c47ff, 0.6).strokeCircle(clockX, clockY, 14);
    // Hour markers
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const r = 11;
      g.fillStyle(0x4a3880, 1).fillCircle(
        clockX + Math.cos(a) * r, clockY + Math.sin(a) * r, 1.2
      );
    }
    // Clock center
    g.fillStyle(0x6c47ff, 1).fillCircle(clockX, clockY, 2);
    // Animated clock hand
    this.clockHand = this.add.line(clockX, clockY, 0, 0, 0, -9, 0xa78bfa).setLineWidth(1.5).setDepth(4);

    // ── Towel rack (near entrance) ────────────────────────────────────────
    g.fillStyle(0x2a2030, 1).fillRoundedRect(W * 0.5 - 24, 22, 48, 8, 4);
    g.lineStyle(1, 0x6c47ff, 0.3).strokeRoundedRect(W * 0.5 - 24, 22, 48, 8, 4);
    // Towels
    const towelColors = [0x4cc9f0, 0xf72585, 0x00d4aa];
    for (let i = 0; i < 3; i++) {
      g.fillStyle(towelColors[i], 0.7).fillRoundedRect(W * 0.5 - 18 + i * 14, 24, 10, 5, 2);
    }

    // ── Ambient overhead light cones — mixed neon-arcade palette ───────────
    const lightPositions = [
      { x: 140, y: 20, color: 0x6c47ff },  // weight zone — purple
      { x: 280, y: 20, color: 0xf72585 },  // weight zone — hot pink accent
      { x: 420, y: 20, color: 0x6c47ff },
      { x: 140, y: H * 0.3, color: 0x00d4aa },  // cardio zone — teal
      { x: 280, y: H * 0.3, color: 0x4cc9f0 },  // cardio zone — electric cyan
    ];
    const lightG = this.add.graphics().setDepth(1).setAlpha(0.09);
    lightPositions.forEach((lp) => {
      lightG.fillStyle(lp.color, 1);
      // Light cone triangle
      lightG.fillTriangle(
        lp.x, lp.y,
        lp.x - 60, lp.y + H * 0.25,
        lp.x + 60, lp.y + H * 0.25
      );
      // Store arc for pulse animation
      const arc = this.add.arc(lp.x, lp.y + 2, 6, 0, 360, false, lp.color, 0.75).setDepth(2);
      this.ambientLights.push(arc);
    });

    // ── Animated floor glow strips ────────────────────────────────────────
    const stripG = this.add.graphics().setDepth(0).setAlpha(0.16);
    // Weight zone accent strip
    stripG.fillStyle(0x6c47ff, 1).fillRect(20, H * 0.28, W - 40, 2);
    stripG.fillStyle(0x00d4aa, 1).fillRect(20, H * 0.57, W - 40, 2);
    this.tweens.add({
      targets: stripG, alpha: 0.3,
      duration: 2000, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
  }

  // ── Particle systems ────────────────────────────────────────────────────────
  private setupParticles(W: number, H: number) {
    // Ambient dust motes floating through gym
    this.dustEmitter = this.add.particles(0, 0, "particle_dust", {
      x: { min: 20, max: W - 20 },
      y: { min: 20, max: H * 0.57 },
      lifespan: { min: 4000, max: 8000 },
      speedX: { min: -8, max: 8 },
      speedY: { min: -12, max: -4 },
      scale: { min: 0.4, max: 1.2 },
      alpha: { start: 0.35, end: 0 },
      quantity: 1,
      frequency: 600,
    });
    this.dustEmitter.setDepth(10);
  }

  // ── Completion burst particles ─────────────────────────────────────────────
  private spawnCompletionBurst(x: number, y: number) {
    // XP sparkle burst
    this.add.particles(x, y, "particle_xp", {
      lifespan: 900,
      speedX: { min: -80, max: 80 },
      speedY: { min: -120, max: -20 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 8,
      duration: 100,
    }).setDepth(300);
    // Gold coin shower
    this.add.particles(x + 20, y, "particle_coin", {
      lifespan: 700,
      speedX: { min: -50, max: 80 },
      speedY: { min: -100, max: 20 },
      gravityY: 200,
      scale: { start: 1, end: 0.2 },
      alpha: { start: 1, end: 0 },
      quantity: 5,
      duration: 80,
    }).setDepth(300);
  }

  // ── Zone label ─────────────────────────────────────────────────────────────
  private addZoneLabel(text: string, x: number, y: number) {
    this.add.text(x, y, text, {
      fontFamily: "Inter, sans-serif",
      fontSize: "8px",
      color: "#25253a",
      letterSpacing: 2,
    }).setOrigin(0.5).setDepth(1);
  }

  // ── Interaction logic ──────────────────────────────────────────────────────
  private tryInteract(worldX: number, worldY: number) {
    void worldX; void worldY;
    for (const eq of this.equipment) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, eq.x, eq.y);
      if (dist < 70) {
        this.activateEquipment(eq);
        return;
      }
    }
    const cashDist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      this.cashPoint.x, this.cashPoint.y
    );
    if (cashDist < 80) {
      const collected = this.incomeSystem.collectPending();
      if (collected > 0) {
        EventBus.emit("income:collected", { amount: collected, x: this.cashPoint.x, y: this.cashPoint.y });
        this.incomeSystem.spawnReward(this.cashPoint.x, this.cashPoint.y - 40, `+${collected} 💰 Collected!`, "#ffd700");
        this.camera.shake(80, 0.002);
        this.spawnCompletionBurst(this.cashPoint.x, this.cashPoint.y - 20);
      }
    }
  }

  private activateEquipment(eq: Equipment) {
    if (eq.isOccupied) return;
    this.activeEquipment = eq;
    this.player.x = eq.x;
    this.player.y = eq.y + 50;
    this.player.setPlayerState("WORKING_OUT");
    eq.startWorkout(25_000);
    // Zoom in slightly on activation
    this.tweens.add({
      targets: this.camera, zoom: 1.08,
      duration: 300, ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: this.camera, zoom: 1.0, duration: 500, ease: "Sine.easeOut" });
      },
    });
    EventBus.emit("workout:started", {
      equipmentId: eq.equipId,
      intensity: eq.intensity,
    });
  }

  // ── Update loop ────────────────────────────────────────────────────────────
  update(time: number, delta: number) {
    this.controller.update(delta);

    // Equipment — only tick the player's own active equipment.
    // NPC-occupied equipment sets isOccupied directly (see NpcManager) and must
    // never run through Equipment.updateWorkout, or it fires a stale workout:complete
    // and pops the player's XP reward modal for NPC activity.
    if (this.activeEquipment) {
      const finished = this.activeEquipment.updateWorkout(delta);
      if (finished) {
        this.activeEquipment = null;
      }
    }

    // Proximity prompts
    for (const eq of this.equipment) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, eq.x, eq.y);
      eq.showPrompt(dist < 70 && !eq.isOccupied);
    }

    // NPCs
    this.npcManager.update(delta);

    // Depth sort
    this.player.updateDepth();

    // Cash glow when income pending — only queue a fresh pulse once the last
    // one has finished, or this stacks a brand-new tween on cashGlow every
    // single frame for as long as income is pending (severe perf/jank bug).
    if (this.incomeSystem.getPending() > 0 && !this.tweens.isTweening(this.cashGlow)) {
      this.tweens.add({
        targets: this.cashGlow,
        fillAlpha: 0.45,
        duration: 600, yoyo: true, repeat: 0,
      });
    }

    // Clock hand rotation
    const seconds = (time / 1000) % 60;
    const angle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
    this.clockHand.setTo(0, 0, Math.cos(angle) * 9, Math.sin(angle) * 9);

    // TV screen subtle flicker
    this.tvFlicker += delta;
    if (this.tvFlicker > 3000 + Math.random() * 2000) {
      this.tvFlicker = 0;
      this.tvScreen.setAlpha(0.05);
      this.time.delayedCall(60, () => this.tvScreen.setAlpha(0.15));
    }

    // Neon sign flicker
    this.neonFlicker += delta;
    if (this.neonFlicker > 5000 + Math.random() * 8000) {
      this.neonFlicker = 0;
      this.neonSignText.setAlpha(0.2);
      this.time.delayedCall(80, () => this.neonSignText.setAlpha(1));
      this.time.delayedCall(120, () => this.neonSignText.setAlpha(0.4));
      this.time.delayedCall(200, () => this.neonSignText.setAlpha(1));
    }

    // Ambient light pulse
    this.ambientLightTimer += delta;
    if (this.ambientLightTimer > 100) {
      this.ambientLightTimer = 0;
      const pulse = 0.4 + Math.sin(time * 0.001) * 0.15;
      this.ambientLights.forEach((l, i) => {
        l.setAlpha(pulse + Math.sin(time * 0.0015 + i * 0.8) * 0.1);
      });
    }
  }

  shutdown() {
    EventBus.off("npc:paid", this.onNpcPaid);
    EventBus.off("workout:complete", this.onWorkoutComplete);
    EventBus.off("scene:switch", this.onSceneSwitch);
    EventBus.off("hud:quit_workout", this.onQuitWorkout);
    this.controller.destroy();
    this.dustEmitter?.destroy();
  }
}
