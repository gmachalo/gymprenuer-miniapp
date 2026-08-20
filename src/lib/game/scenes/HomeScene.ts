import Phaser from "phaser";
import { Player } from "@/lib/game/entities/Player";
import { PlayerController } from "@/lib/game/systems/PlayerController";
import { Equipment } from "@/lib/game/entities/Equipment";
import { IncomeSystem } from "@/lib/game/systems/IncomeSystem";
import { EventBus } from "@/lib/game/EventBus";

const HOME_EQUIPMENT = [
  { id: "yoga",    name: "Yoga Mat",    tex: "eq_yoga",   x: 120, y: 220, xpCost: 5, xpReward: 8,  tokens: 3, intensity: "LOW"    as const },
  { id: "pushups", name: "Push-ups",    tex: "eq_cable",  x: 260, y: 220, xpCost: 5, xpReward: 8,  tokens: 3, intensity: "MEDIUM" as const },
  { id: "pullup",  name: "Pull-up Bar", tex: "eq_pullup", x: 200, y: 340, xpCost: 8, xpReward: 12, tokens: 5, intensity: "HIGH"   as const },
];

export interface HomeSceneInitData {
  playerBodyType?: "SKINNY" | "AVERAGE" | "OVERWEIGHT";
  playerName?: string;
  playerTransformationStage?: number;
}

export class HomeScene extends Phaser.Scene {
  private player!: Player;
  private controller!: PlayerController;
  private equipment: Equipment[] = [];
  private incomeSystem!: IncomeSystem;
  private initData: HomeSceneInitData = {};
  private activeEquipment: Equipment | null = null;

  // Ambient
  private windowLightTimer = 0;
  private windowLightDir = 1;
  private windowGlow!: Phaser.GameObjects.Graphics;
  private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // Bound EventBus handler references — kept so shutdown() can remove exactly
  // these listeners (EventBus.off(type) with no handler clears ALL listeners
  // for that event, including AudioManager's and GameHUD's, so we must pass
  // the specific function reference here rather than the bare event name).
  private onWorkoutComplete = ({ xpEarned, tokensEarned, equipmentId }: { xpEarned: number; tokensEarned: number; equipmentId: string }) => {
    const eq = this.equipment.find((e) => e.equipId === equipmentId);
    if (eq) {
      this.incomeSystem.spawnXpReward(eq.x, eq.y - 40, xpEarned);
      this.incomeSystem.spawnTokenReward(eq.x + 20, eq.y - 20, tokensEarned);
      this.cameras.main.shake(100, 0.003);
    }
    this.player.setPlayerState("IDLE");
    this.activeEquipment = null;
  };

  private onSceneSwitch = ({ to }: { to: "GymScene" | "HomeScene" | "WorkoutScene" }) => {
    if (to !== "HomeScene") {
      this.cameras.main.fadeOut(250, 12, 11, 7);
      this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start(to));
    }
  };

  private onQuitWorkout = () => {
    if (!this.activeEquipment) return;
    this.activeEquipment.quitWorkout();
    this.activeEquipment = null;
    this.player.setPlayerState("IDLE");
  };

  constructor() {
    super({ key: "HomeScene" });
  }

  init(data: HomeSceneInitData) {
    this.initData = data;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.cameras.main.setBackgroundColor(0x0c0b07);
    this.drawHomeLayout(W, H);

    HOME_EQUIPMENT.forEach((cfg) => {
      const eq = new Equipment({
        scene: this, x: cfg.x, y: cfg.y,
        id: cfg.id, name: cfg.name, textureKey: cfg.tex,
        xpCost: cfg.xpCost, xpReward: cfg.xpReward,
        tokenReward: cfg.tokens, intensity: cfg.intensity,
      });
      this.equipment.push(eq);
    });

    this.player = new Player({
      scene: this, x: W / 2, y: H - 100,
      bodyType: this.initData.playerBodyType ?? "AVERAGE",
      name: this.initData.playerName ?? "You",
      transformationStage: this.initData.playerTransformationStage ?? 0,
    });

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.fadeIn(400, 12, 11, 7);

    this.controller = new PlayerController(this, this.player);
    this.controller.onInteractCallback = (wx, wy) => this.tryInteract(wx, wy);

    this.incomeSystem = new IncomeSystem(this);

    // Ambient dust in sunbeam
    this.dustEmitter = this.add.particles(45, 130, "particle_dust", {
      speedX: { min: 2, max: 12 },
      speedY: { min: -4, max: 4 },
      lifespan: { min: 3000, max: 6000 },
      scale: { min: 0.3, max: 0.9 },
      alpha: { start: 0.45, end: 0 },
      quantity: 1,
      frequency: 500,
    });
    this.dustEmitter.setDepth(5);

    EventBus.on("workout:complete", this.onWorkoutComplete);
    EventBus.on("scene:switch", this.onSceneSwitch);
    EventBus.on("hud:quit_workout", this.onQuitWorkout);

    EventBus.emit("scene:ready", { name: "HomeScene" });

    // create() re-runs every time this scene is started, so the EventBus
    // listeners above must be torn down on shutdown or they pile up and
    // keep firing against this now-destroyed scene's game objects.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private drawHomeLayout(W: number, H: number) {
    const g = this.add.graphics();

    // Warm dark base
    g.fillStyle(0x0c0b07).fillRect(0, 0, W, H);
    // Main floor — warm wood tone
    g.fillStyle(0x1c1810).fillRect(16, 50, W - 32, H - 110);

    // Wood plank lines (horizontal)
    g.lineStyle(1, 0x231e12, 0.9);
    for (let y = 74; y < H - 70; y += 22) g.lineBetween(16, y, W - 16, y);
    // Plank seams (vertical, offset per row)
    g.lineStyle(1, 0x1e1a0e, 0.5);
    for (let y = 74; y < H - 70; y += 44) {
      for (let x = 16 + ((y / 22) % 2) * 40; x < W - 16; x += 80) {
        g.lineBetween(x, y, x, y + 22);
      }
    }

    // Skirting board
    g.fillStyle(0x2a2418, 1);
    g.fillRect(16, 50, W - 32, 8);
    g.fillRect(16, H - 60, W - 32, 8);

    // Window (left wall) — with sunbeam cone
    const winX = 22, winY = 70, winW = 50, winH = 90;
    // Sunbeam cone
    this.windowGlow = this.add.graphics().setDepth(1).setAlpha(0.07);
    this.windowGlow.fillStyle(0xfff4cc, 1);
    this.windowGlow.fillTriangle(winX + winW/2, winY + winH, winX - 20, H - 60, winX + winW + 30, H - 60);
    // Window frame outer
    g.fillStyle(0x3a2f1e, 1).fillRoundedRect(winX - 3, winY - 3, winW + 6, winH + 6, 4);
    // Sky view
    g.fillStyle(0x1a2e4a, 0.8).fillRect(winX, winY, winW, winH);
    // Morning light gradient in window
    g.fillGradientStyle(0xff9950, 0xff9950, 0x4488cc, 0x4488cc, 0.25);
    g.fillRect(winX, winY, winW, winH / 2);
    g.fillStyle(0x4488cc, 0.3).fillRect(winX, winY + winH / 2, winW, winH / 2);
    // Window cross bars
    g.lineStyle(2, 0x3a2f1e, 1);
    g.lineBetween(winX + winW / 2, winY, winX + winW / 2, winY + winH);
    g.lineBetween(winX, winY + winH / 2, winX + winW, winY + winH / 2);
    // Window frame
    g.lineStyle(3, 0x4a3e28, 1).strokeRoundedRect(winX, winY, winW, winH, 3);
    // Window glass sheen
    g.fillStyle(0xffffff, 0.06).fillTriangle(winX + 2, winY + 2, winX + winW * 0.4, winY + 2, winX + 2, winY + winH * 0.4);

    // Mirror (right wall) — large
    const mirX = W - 55, mirY = 65, mirW = 38, mirH = H * 0.5;
    g.fillStyle(0x2a2418, 1).fillRoundedRect(mirX - 4, mirY - 4, mirW + 8, mirH + 8, 5);
    g.fillStyle(0x1e2538, 0.8).fillRect(mirX, mirY, mirW, mirH);
    // Mirror reflection tint
    g.fillStyle(0x3a4a6a, 0.2).fillRect(mirX, mirY, mirW, mirH);
    // Mirror sheen streaks
    g.fillStyle(0xffffff, 0.06).fillRect(mirX + 3, mirY + 4, 8, mirH - 10);
    g.fillStyle(0xffffff, 0.03).fillRect(mirX + 14, mirY + 4, 4, mirH - 10);
    g.lineStyle(2, 0x5a4e38, 1).strokeRoundedRect(mirX, mirY, mirW, mirH, 3);
    // "REFLECTION" label above mirror
    this.add.text(mirX + mirW / 2, mirY - 10, "MIRROR", {
      fontFamily: "Inter, sans-serif", fontSize: "7px",
      color: "#4a3e28", letterSpacing: 2,
    }).setOrigin(0.5).setDepth(2);

    // Bookshelf / shelves on back wall
    g.fillStyle(0x2a2010, 1).fillRoundedRect(W * 0.4, 55, 60, 10, 2);
    g.lineStyle(1, 0x4a3820, 0.6).strokeRoundedRect(W * 0.4, 55, 60, 10, 2);
    // Trophies / items on shelf
    const itemColors = [0xffd700, 0x00d4aa, 0x6c47ff];
    for (let i = 0; i < 3; i++) {
      g.fillStyle(itemColors[i], 0.8).fillRoundedRect(W * 0.4 + 8 + i * 18, 48, 10, 8, 2);
    }

    // Room label
    this.add.text(W / 2, 34, "🏠 HOME WORKOUT ROOM", {
      fontFamily: "Inter, sans-serif", fontSize: "9px",
      color: "#3a2e1a", letterSpacing: 2,
    }).setOrigin(0.5).setDepth(2);

    // Wall accent border
    g.lineStyle(2, 0xf59e0b, 0.18).strokeRect(16, 50, W - 32, H - 110);
  }

  private tryInteract(worldX: number, worldY: number) {
    void worldX; void worldY;
    for (const eq of this.equipment) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, eq.x, eq.y);
      if (dist < 70 && !eq.isOccupied) {
        this.player.x = eq.x;
        this.player.y = eq.y + 50;
        this.player.setPlayerState("WORKING_OUT");
        this.activeEquipment = eq;
        eq.startWorkout(20_000);
        // Zoom pulse on activation
        this.tweens.add({
          targets: this.cameras.main, zoom: 1.08, duration: 280, ease: "Back.easeOut",
          onComplete: () => {
            this.tweens.add({ targets: this.cameras.main, zoom: 1.0, duration: 450, ease: "Sine.easeOut" });
          },
        });
        EventBus.emit("workout:started", { equipmentId: eq.equipId, intensity: eq.intensity });
        return;
      }
    }
  }

  update(_time: number, delta: number) {
    this.controller.update(delta);
    // Only tick the player's own active equipment — mirrors GymScene, and keeps
    // activeEquipment accurate for quitWorkout() to target.
    if (this.activeEquipment) {
      const finished = this.activeEquipment.updateWorkout(delta);
      if (finished) this.activeEquipment = null;
    }
    for (const eq of this.equipment) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, eq.x, eq.y);
      eq.showPrompt(dist < 70 && !eq.isOccupied);
    }
    this.player.updateDepth();

    // Animate sunbeam
    this.windowLightTimer += delta;
    if (this.windowLightTimer > 80) {
      this.windowLightTimer = 0;
      const a = this.windowGlow.alpha + this.windowLightDir * 0.0003;
      if (a > 0.1 || a < 0.04) this.windowLightDir *= -1;
      this.windowGlow.setAlpha(a);
    }
  }

  shutdown() {
    EventBus.off("workout:complete", this.onWorkoutComplete);
    EventBus.off("scene:switch", this.onSceneSwitch);
    EventBus.off("hud:quit_workout", this.onQuitWorkout);
    this.controller.destroy();
    this.dustEmitter?.destroy();
  }
}
