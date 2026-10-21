import Phaser from "phaser";
import { Player } from "@/lib/game/entities/Player";
import {
  PlayerController,
  pickTapTarget,
  pingTarget,
  STAND_OFFSET,
  type Interactable,
} from "@/lib/game/systems/PlayerController";
import { NpcManager } from "@/lib/game/systems/NpcManager";
import { IncomeSystem } from "@/lib/game/systems/IncomeSystem";
import { EventBus } from "@/lib/game/EventBus";
import { Equipment } from "@/lib/game/entities/Equipment";
import { RecoveryProp } from "@/lib/game/entities/RecoveryProp";
import { CameraRig } from "@/lib/game/systems/CameraRig";
import {
  equipmentAvailableForTier,
  equipmentSpec,
  equipmentTokenYield,
  amenitySpec,
  standardAmenities,
  floorOrder,
} from "@/lib/game/engine";

// The floor is whatever the gym actually owns (passed in from the server). A
// gym with nothing installed falls back to the tier-1 basics so the scene is
// never empty.
export interface GymEquipmentInit {
  id: string;
  type: string;
  name: string;
  level: number;
  grade: number;
  tokens: number;
}

// ─── Floor plan ──────────────────────────────────────────────────────────────
// Scenes lay out in a fixed 480-wide logical space (see PhaserGame). Top to
// bottom: the back wall with windows onto the city, the training floor (a 4×4
// equipment grid), the lounge where amenities live, and the entrance with
// reception. The wall and training floor are fixed; the lounge and entrance are
// anchored to the bottom, so a taller screen simply gets a longer walkway.

const BACK_WALL_HEIGHT = 98;
/** Window openings in the back wall — the skyline shows through these. */
const WINDOWS = [
  { x: 28, w: 84 }, { x: 148, w: 84 }, { x: 248, w: 84 }, { x: 368, w: 84 },
];
const WINDOW_Y = 65;
const WINDOW_H = 30;

const EQUIPMENT_ORIGIN = { x: 95, y: 150 };
const EQUIPMENT_SPACING = { x: 100, y: 105 };
const EQUIPMENT_PER_ROW = 4;
const EQUIPMENT_MAX_ROWS = 4;
/** The last row's name labels end at y=511. */
const TRAINING_FLOOR_BOTTOM = 514;

/** Lounge spans from here to the entrance; both are measured up from the bottom. */
const LOUNGE_FROM_BOTTOM = 290;
const ENTRANCE_FROM_BOTTOM = 92;

function equipmentSlot(index: number): { x: number; y: number } {
  const row = Math.floor(index / EQUIPMENT_PER_ROW);
  return {
    x: EQUIPMENT_ORIGIN.x + (index % EQUIPMENT_PER_ROW) * EQUIPMENT_SPACING.x,
    y: EQUIPMENT_ORIGIN.y + Math.min(row, EQUIPMENT_MAX_ROWS - 1) * EQUIPMENT_SPACING.y,
  };
}

/**
 * Resolve the pieces to render — the gym's own floor, or the tier-1 default —
 * in floor order (strength at the back, cardio toward the front), the same
 * order the dashboard tiles use.
 */
function resolveGymEquipment(owned?: GymEquipmentInit[]) {
  const known = (owned ?? []).filter((piece) => !!equipmentSpec(piece.type));

  const pieces =
    known.length > 0
      ? known
      : equipmentAvailableForTier(1).map((spec) => ({
          id: spec.type,
          type: spec.type,
          name: spec.name,
          level: 1,
          grade: spec.grade,
          tokens: equipmentTokenYield(spec, 1),
        }));

  // Only what fits on the floor is placed; beyond that pieces would stack.
  return floorOrder(pieces).slice(0, EQUIPMENT_PER_ROW * EQUIPMENT_MAX_ROWS).map((piece, index) => {
    const spec = equipmentSpec(piece.type)!;
    return {
      ...equipmentSlot(index),
      id: piece.type,
      name: piece.name || spec.name,
      tex: spec.tex,
      xpCost: spec.xpCost,
      tokens: piece.tokens || equipmentTokenYield(spec, piece.level),
      intensity: spec.intensity,
      level: piece.level,
      grade: spec.grade,
    };
  });
}

/** x positions for `n` props centred on the floor, 90px apart. */
function centredRow(n: number, W: number): number[] {
  return Array.from({ length: n }, (_, i) => W / 2 + (i - (n - 1) / 2) * 90);
}

// Row B keeps the middle clear: it is the walkway up from the entrance. Filled
// inside-out so a gym with one room still looks balanced.
const ROW_B_X = [150, 330, 60, 420];

const AMENITY_KIND_ORDER: Record<string, number> = { HYGIENE: 0, REFRESHMENT: 1, STORAGE: 2, ROOM: 3 };

/**
 * Lay out the lounge. Every gym has its standard fittings — the water dispenser
 * and shower — plus whatever the owner has installed. Rooms (yoga studio,
 * sauna, pool) always take row B, where there is space to wall them in; the
 * rest fill row A and overflow behind the rooms. Nine props fit, which is the
 * most a tier-5 gym can hold (2 standard + 7 bought).
 */
function resolveGymAmenities(W: number, H: number, installed?: string[]) {
  const specs = [
    ...standardAmenities(),
    ...(installed ?? [])
      .map((type) => amenitySpec(type))
      .filter((spec): spec is NonNullable<typeof spec> => !!spec && !spec.standard),
  ]
    .map((spec, index) => ({ spec, index }))
    .sort((a, b) => AMENITY_KIND_ORDER[a.spec.kind] - AMENITY_KIND_ORDER[b.spec.kind] || a.index - b.index)
    .map(({ spec }) => spec);

  const rooms = specs.filter((spec) => spec.kind === "ROOM");
  const others = specs.filter((spec) => spec.kind !== "ROOM");

  const rowAY = H - 236;
  const rowBY = H - 136;
  const rowA = others.slice(0, 5);
  const rowB = [...rooms, ...others.slice(5)].slice(0, ROW_B_X.length);
  const rowAX = centredRow(rowA.length, W);

  const placed = [
    ...rowA.map((spec, i) => ({ spec, x: rowAX[i], y: rowAY })),
    ...rowB.map((spec, i) => ({ spec, x: ROW_B_X[i], y: rowBY })),
  ];

  return placed.map(({ spec, x, y }) => ({
    x,
    y,
    id: spec.type,
    kind: spec.kind,
    label: spec.name,
    verb: spec.verb,
    tex: spec.tex,
    xpGain: spec.xpGain,
    cooldownMs: spec.cooldownMs,
    accentColor: spec.accentColor,
    usable: spec.xpGain > 0,
  }));
}

export interface GymSceneInitData {
  playerBodyType?: "SKINNY" | "AVERAGE" | "OVERWEIGHT";
  playerName?: string;
  playerTransformationStage?: number;
  currentXp?: number;
  overflowXp?: number;
  gymReputation?: number;
  gymTier?: number;
  /** The player's level — workouts cost more as it rises (see workoutXpCost). */
  playerLevel?: number;
  /** Tier display name ("Iron Pit") — shown on the neon sign. */
  gymTierName?: string;
  /** False when the player belongs to no gym — BootScene then starts at home. */
  hasGym?: boolean;
  /** The equipment actually installed at the player's gym. */
  gymEquipment?: GymEquipmentInit[];
  /** Amenity catalog keys the player's gym has bought (standard fittings are implicit). */
  gymAmenities?: string[];
}

export class GymScene extends Phaser.Scene {
  private player!: Player;
  private controller!: PlayerController;
  private equipment: Equipment[] = [];
  private amenities: RecoveryProp[] = [];
  private npcManager!: NpcManager;
  private incomeSystem!: IncomeSystem;
  private camera!: Phaser.Cameras.Scene2D.Camera;
  private cameraRig!: CameraRig;
  private activeEquipment: Equipment | null = null;
  private initData: GymSceneInitData = {};
  // Guards shutdown() against running twice when both SHUTDOWN and DESTROY fire.
  private tornDown = false;

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

  private onWorkoutComplete = ({ xpCost, tokensEarned, equipmentId }: { xpCost: number; tokensEarned: number; equipmentId: string }) => {
    const eq = this.equipment.find((e) => e.equipId === equipmentId);
    if (eq) {
      this.incomeSystem.spawnXpCost(eq.x, eq.y - 40, xpCost);
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

  // Workouts cost more at higher levels; re-price every machine when the HUD
  // reports a level-up, and remember it for the next scene start.
  private onLevelUp = ({ newLevel }: { newLevel: number }) => {
    this.initData.playerLevel = newLevel;
    const registered = this.registry.get("playerData") as Record<string, unknown> | undefined;
    if (registered) this.registry.set("playerData", { ...registered, playerLevel: newLevel });
    this.equipment.forEach((eq) => eq.setPlayerLevel(newLevel));
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
    // PhaserGame stores the player and gym in the registry; scene.start() from
    // BootScene or a scene switch passes nothing, so read it from there.
    const registered = (this.registry.get("playerData") as GymSceneInitData | undefined) ?? {};
    this.initData = { ...registered, ...(data ?? {}) };
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
    this.amenities = [];
    this.ambientLights = [];
    this.activeEquipment = null;

    // ── Parallax background (city through windows) ───────────────────────────
    this.drawParallaxBackground(W);

    // ── Main gym layout ───────────────────────────────────────────────────────
    this.cameras.main.setBackgroundColor(0x09090f);
    this.drawGymLayout(W, H);

    // ── Gym props & decorations ───────────────────────────────────────────────
    this.addGymProps(W, H);

    // ── Zone labels ───────────────────────────────────────────────────────────
    // Each sits in a verified gap: under the windows and above the first row of
    // grade badges, and above the lounge's first row of amenities.
    this.addZoneLabel("⚡ TRAINING FLOOR", W / 2, 104);
    this.addZoneLabel("🛋️ LOUNGE", W / 2, H - 278);

    // ── Equipment ─────────────────────────────────────────────────────────────
    resolveGymEquipment(this.initData.gymEquipment).forEach((cfg) => {
      const eq = new Equipment({
        scene: this,
        x: cfg.x, y: cfg.y,
        id: cfg.id, name: cfg.name,
        textureKey: cfg.tex,
        xpCost: cfg.xpCost,
        playerLevel: this.initData.playerLevel ?? 1,
        tokenReward: cfg.tokens,
        intensity: cfg.intensity,
        level: cfg.level,
        grade: cfg.grade,
      });
      this.equipment.push(eq);
    });

    // ── Open bays ─────────────────────────────────────────────────────────────
    // Faint pads where the gym could install more at its current tier, so a
    // young gym's floor reads as room to grow rather than as empty space.
    if (this.initData.gymEquipment?.length) {
      const capacity = equipmentAvailableForTier(this.initData.gymTier ?? 1).length;
      for (let i = this.equipment.length; i < Math.min(capacity, EQUIPMENT_PER_ROW * EQUIPMENT_MAX_ROWS); i++) {
        this.drawOpenBay(equipmentSlot(i));
      }
    }

    // ── Amenities ─────────────────────────────────────────────────────────────
    resolveGymAmenities(W, H, this.initData.gymAmenities).forEach((cfg) => {
      // Rooms are walled off from the lounge, with their own floor and ambience.
      if (cfg.kind === "ROOM") this.drawRoomEnclosure(cfg.x, cfg.y, cfg.accentColor, cfg.id);
      const prop = new RecoveryProp({
        scene: this,
        x: cfg.x, y: cfg.y,
        id: cfg.id,
        label: cfg.label,
        verb: cfg.usable ? cfg.verb : "Members only",
        textureKey: cfg.tex,
        xpGain: cfg.xpGain,
        accentColor: cfg.accentColor,
      });
      this.amenities.push(prop);
    });

    // ── Cash collection point ──────────────────────────────────────────────────
    // Sits on the reception desk by the entrance (see addFrontOfHouse).
    this.cashPoint = this.add.container(330, H - 56).setDepth(H - 40);
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
    this.setupParticles(W);

    // ── Player ────────────────────────────────────────────────────────────────
    this.player = new Player({
      scene: this,
      x: W / 2,
      y: H - 58,
      bodyType: this.initData.playerBodyType ?? "AVERAGE",
      name: this.initData.playerName ?? "You",
      transformationStage: this.initData.playerTransformationStage ?? 0,
    });

    // ── Camera ────────────────────────────────────────────────────────────────
    this.camera = this.cameras.main;
    this.camera.setZoom(1.0);
    // Follows the player, can scroll under the HUD overlays, and pans on the
    // mouse wheel — see CameraRig.
    this.cameraRig = new CameraRig(this, this.camera, this.player, W, H);

    // ── Player Controller ─────────────────────────────────────────────────────
    this.controller = new PlayerController(this, this.player);
    this.controller.onTapCallback = (wx, wy) => this.handleTap(wx, wy);
    this.controller.onInteractKey = () => this.interactNearby();

    // ── Systems ───────────────────────────────────────────────────────────────
    this.incomeSystem = new IncomeSystem(this);
    this.npcManager = new NpcManager(
      this,
      this.equipment,
      { x: W / 2, y: H - 12 },
      { x: W / 2, y: H - 12 },
      this.initData.gymReputation ?? 50
    );

    // ── EventBus listeners ────────────────────────────────────────────────────
    // Detach first: teardown paths that skip SHUTDOWN (a game.destroy() from a
    // React unmount or an HMR reload) leave the previous registration in place,
    // and mitt happily stores the same handler twice — which would double every
    // NPC payout. off() on an unregistered handler is a no-op, so this is safe
    // on the first create() too.
    EventBus.off("npc:paid", this.onNpcPaid);
    EventBus.off("workout:complete", this.onWorkoutComplete);
    EventBus.off("scene:switch", this.onSceneSwitch);
    EventBus.off("hud:quit_workout", this.onQuitWorkout);
    EventBus.off("player:level_up", this.onLevelUp);

    EventBus.on("npc:paid", this.onNpcPaid);
    EventBus.on("workout:complete", this.onWorkoutComplete);
    EventBus.on("scene:switch", this.onSceneSwitch);
    EventBus.on("hud:quit_workout", this.onQuitWorkout);
    EventBus.on("player:level_up", this.onLevelUp);

    // Fade in on scene start
    this.cameras.main.fadeIn(400, 9, 9, 15);
    EventBus.emit("scene:ready", { name: "GymScene" });

    // create() re-runs every time this scene is started, so the EventBus
    // listeners above must be torn down or they pile up and keep firing against
    // this now-destroyed scene's game objects. Both events are wired because
    // they cover different paths: a scene switch emits SHUTDOWN, while the
    // game.destroy(true) on React unmount emits only DESTROY. shutdown() is
    // idempotent, so it is fine when both fire.
    this.tornDown = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  // ── City skyline (seen through the back-wall windows) ───────────────────────
  // Drawn behind everything with a light parallax; the back wall is painted
  // around its windows, so this is only ever seen through them.
  private drawParallaxBackground(W: number) {
    const bg = this.add.graphics().setScrollFactor(0.15).setDepth(-10);
    const top = WINDOW_Y - 6;
    const base = WINDOW_Y + WINDOW_H + 4;

    // Dusk sky: deep violet into navy
    bg.fillGradientStyle(0x1a0b3a, 0x1a0b3a, 0x0d1535, 0x0d1535, 1);
    bg.fillRect(-60, top, W + 120, base - top);

    // Moon, with a soft halo
    bg.fillStyle(0xfff8e7, 0.06).fillCircle(W * 0.78, WINDOW_Y + 9, 12);
    bg.fillStyle(0xfff8e7, 0.55).fillCircle(W * 0.78, WINDOW_Y + 9, 4);

    // Two depths of buildings: a hazy far row, then a darker near row with lit
    // windows. Window lights are seeded so the skyline is the same every visit.
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let x = -60; x < W + 60; ) {
      const w = 14 + Math.floor(rand() * 18);
      const h = 8 + Math.floor(rand() * 12);
      bg.fillStyle(0x161a33, 1).fillRect(x, base - h, w, h);
      x += w + 2;
    }
    for (let x = -60; x < W + 60; ) {
      const w = 16 + Math.floor(rand() * 22);
      const h = 12 + Math.floor(rand() * 16);
      bg.fillStyle(0x0b0c18, 1).fillRect(x, base - h, w, h);
      for (let wy = base - h + 3; wy < base - 3; wy += 5) {
        for (let wx = x + 3; wx < x + w - 3; wx += 5) {
          if (rand() > 0.62) {
            bg.fillStyle(rand() > 0.7 ? 0xffe4b5 : 0x8fb3ff, 0.55).fillRect(wx, wy, 2, 2);
          }
        }
      }
      x += w + 3;
    }
  }

  // ── Main gym floor & walls ─────────────────────────────────────────────────
  private drawGymLayout(W: number, H: number) {
    const g = this.add.graphics();
    const loungeTop = H - LOUNGE_FROM_BOTTOM;
    const entranceTop = H - ENTRANCE_FROM_BOTTOM;

    // ── Back wall, painted around the window openings ──────────────────────
    const wall = 0x0e0d18;
    g.fillStyle(wall, 1);
    g.fillRect(0, 0, W, WINDOW_Y);
    g.fillRect(0, WINDOW_Y + WINDOW_H, W, BACK_WALL_HEIGHT - WINDOW_Y - WINDOW_H);
    let cursor = 0;
    for (const win of WINDOWS) {
      g.fillRect(cursor, WINDOW_Y, win.x - cursor, WINDOW_H);
      cursor = win.x + win.w;
    }
    g.fillRect(cursor, WINDOW_Y, W - cursor, WINDOW_H);

    // Acoustic panelling above the windows
    g.lineStyle(1, 0x191729, 1);
    for (let x = 20; x < W; x += 40) g.lineBetween(x, 6, x, WINDOW_Y - 6);

    // Window frames, mullions and a lit sill
    for (const win of WINDOWS) {
      g.lineStyle(2, 0x2c2945, 1).strokeRect(win.x, WINDOW_Y, win.w, WINDOW_H);
      g.lineStyle(1, 0x2c2945, 0.9).lineBetween(win.x + win.w / 2, WINDOW_Y, win.x + win.w / 2, WINDOW_Y + WINDOW_H);
      g.fillStyle(0x6c47ff, 0.25).fillRect(win.x - 2, WINDOW_Y + WINDOW_H, win.w + 4, 2);
    }

    // Everything below the wall
    g.fillStyle(0x08080e, 1).fillRect(0, BACK_WALL_HEIGHT, W, H - BACK_WALL_HEIGHT);
    // Neon skirting where the wall meets the floor
    g.fillStyle(0x6c47ff, 0.45).fillRect(0, BACK_WALL_HEIGHT - 2, W, 2);

    // ── Training floor: rubber matting, weights at the back, cardio in front ─
    const tf = { x: 16, y: BACK_WALL_HEIGHT + 2, w: W - 32, h: TRAINING_FLOOR_BOTTOM - BACK_WALL_HEIGHT - 2 };
    g.fillStyle(0x13131d, 1).fillRect(tf.x, tf.y, tf.w, tf.h);
    g.fillStyle(0x17172a, 0.6);
    for (let x = tf.x; x < tf.x + tf.w; x += 88) {
      for (let y = tf.y; y < tf.y + tf.h; y += 88) g.fillRect(x, y, 44, 44);
    }
    g.lineStyle(1, 0x1b1b2c, 0.8);
    for (let x = tf.x; x <= tf.x + tf.w; x += 44) g.lineBetween(x, tf.y, x, tf.y + tf.h);
    for (let y = tf.y; y <= tf.y + tf.h; y += 44) g.lineBetween(tf.x, y, tf.x + tf.w, y);
    g.fillStyle(0x6c47ff, 0.04).fillRect(tf.x, tf.y, tf.w, tf.h / 2);
    g.fillStyle(0x00d4aa, 0.035).fillRect(tf.x, tf.y + tf.h / 2, tf.w, tf.h / 2);
    g.lineStyle(2, 0x6c47ff, 0.45).strokeRect(tf.x, tf.y, tf.w, tf.h);
    g.lineStyle(1, 0x4a30cc, 0.2).strokeRect(tf.x + 3, tf.y + 3, tf.w - 6, tf.h - 6);

    // ── Walkway: a runner carpet, only where a tall screen leaves a gap ─────
    const runner = { x: W / 2 - 34, w: 68 };
    if (loungeTop > TRAINING_FLOOR_BOTTOM + 8) {
      // Corridor flooring either side, so the gap reads as a hallway, not void
      const gap = loungeTop - TRAINING_FLOOR_BOTTOM;
      g.fillStyle(0x0f0f18, 1).fillRect(16, TRAINING_FLOOR_BOTTOM, W - 32, gap);
      g.lineStyle(1, 0x171723, 1);
      for (let y = TRAINING_FLOOR_BOTTOM + 32; y < loungeTop; y += 32) g.lineBetween(16, y, W - 16, y);
      for (let x = 48; x < W - 16; x += 64) g.lineBetween(x, TRAINING_FLOOR_BOTTOM, x, loungeTop);
      g.lineStyle(1, 0x2a2840, 1).strokeRect(16, TRAINING_FLOOR_BOTTOM, W - 32, gap);
      g.fillStyle(0x1c1530, 1).fillRect(runner.x, TRAINING_FLOOR_BOTTOM, runner.w, loungeTop - TRAINING_FLOOR_BOTTOM);
      g.fillStyle(0xa78bfa, 0.35);
      g.fillRect(runner.x + 4, TRAINING_FLOOR_BOTTOM, 2, loungeTop - TRAINING_FLOOR_BOTTOM);
      g.fillRect(runner.x + runner.w - 6, TRAINING_FLOOR_BOTTOM, 2, loungeTop - TRAINING_FLOOR_BOTTOM);
    }

    // ── Lounge: warm wood planks ────────────────────────────────────────────
    const lf = { x: 16, y: loungeTop, w: W - 32, h: entranceTop - loungeTop - 2 };
    g.fillStyle(0x1a1510, 1).fillRect(lf.x, lf.y, lf.w, lf.h);
    g.lineStyle(1, 0x241c14, 1);
    for (let y = lf.y + 16, row = 0; y < lf.y + lf.h; y += 16, row++) {
      g.lineBetween(lf.x, y, lf.x + lf.w, y);
      // Staggered plank joints
      for (let x = lf.x + (row % 2 ? 30 : 60); x < lf.x + lf.w; x += 90) g.lineBetween(x, y - 16, x, y);
    }
    g.fillStyle(0xf59e0b, 0.03).fillRect(lf.x, lf.y, lf.w, lf.h);
    g.lineStyle(2, 0xf59e0b, 0.3).strokeRect(lf.x, lf.y, lf.w, lf.h);

    // ── Entrance: tiled lobby, the runner continuing to the door ────────────
    const ef = { x: 16, y: entranceTop, w: W - 32, h: ENTRANCE_FROM_BOTTOM - 6 };
    g.fillStyle(0x101018, 1).fillRect(ef.x, ef.y, ef.w, ef.h);
    g.lineStyle(1, 0x1a1a26, 1);
    for (let x = ef.x; x <= ef.x + ef.w; x += 24) g.lineBetween(x, ef.y, x, ef.y + ef.h);
    for (let y = ef.y; y <= ef.y + ef.h; y += 24) g.lineBetween(ef.x, y, ef.x + ef.w, y);
    g.fillStyle(0x1c1530, 0.9).fillRect(runner.x, ef.y, runner.w, ef.h);
    g.lineStyle(2, 0x4cc9f0, 0.25).strokeRect(ef.x, ef.y, ef.w, ef.h);

    this.backgroundLayer = g;
  }

  // ── Back-wall decor ────────────────────────────────────────────────────────
  private addGymProps(W: number, H: number) {
    const g = this.add.graphics().setDepth(2);

    // ── Wall clock ─────────────────────────────────────────────────────────
    const clockX = 44, clockY = 34;
    g.fillStyle(0x1a1a2e, 1).fillCircle(clockX, clockY, 14);
    g.lineStyle(1, 0x6c47ff, 0.6).strokeCircle(clockX, clockY, 14);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      g.fillStyle(0x4a3880, 1).fillCircle(clockX + Math.cos(a) * 11, clockY + Math.sin(a) * 11, 1.2);
    }
    g.fillStyle(0x6c47ff, 1).fillCircle(clockX, clockY, 2);
    this.clockHand = this.add.line(clockX, clockY, 0, 0, 0, -9, 0xa78bfa).setLineWidth(1.5).setDepth(4);

    // ── Towel rack ─────────────────────────────────────────────────────────
    g.fillStyle(0x2a2030, 1).fillRoundedRect(92, 30, 52, 8, 4);
    g.lineStyle(1, 0x6c47ff, 0.3).strokeRoundedRect(92, 30, 52, 8, 4);
    [0x4cc9f0, 0xf72585, 0x00d4aa].forEach((c, i) => {
      g.fillStyle(c, 0.75).fillRoundedRect(98 + i * 15, 32, 11, 9, 2);
    });

    // ── Neon sign: the gym's tier, in name and stars ───────────────────────
    const tier = Math.min(Math.max(this.initData.gymTier ?? 1, 1), 5);
    const tierName = (this.initData.gymTierName ?? "Gymprenuer").toUpperCase();
    const signX = W / 2, signY = 34, signW = 168, signH = 30;
    g.fillStyle(0x0b0a16, 0.95).fillRoundedRect(signX - signW / 2, signY - signH / 2, signW, signH, 7);
    g.lineStyle(2, 0x6c47ff, 0.85).strokeRoundedRect(signX - signW / 2, signY - signH / 2, signW, signH, 7);
    g.lineStyle(6, 0x6c47ff, 0.12).strokeRoundedRect(signX - signW / 2, signY - signH / 2, signW, signH, 7);
    this.neonSignText = this.add.text(signX, signY - 4, tierName, {
      fontFamily: "Inter, sans-serif", fontSize: "10px", fontStyle: "bold",
      color: "#c4b5fd", letterSpacing: 2,
    }).setOrigin(0.5).setDepth(4);
    this.add.text(signX, signY + 8, "★".repeat(tier) + "☆".repeat(5 - tier), {
      fontFamily: "Inter, sans-serif", fontSize: "8px", color: "#ffd700", letterSpacing: 2,
    }).setOrigin(0.5).setDepth(4);

    // ── TV ─────────────────────────────────────────────────────────────────
    this.add.image(368, 34, "prop_tv").setOrigin(0.5).setDepth(3);
    this.tvScreen = this.add.rectangle(368, 38, 42, 24, 0x00d4aa, 0.15).setDepth(4);

    // ── Poster ─────────────────────────────────────────────────────────────
    g.fillStyle(0x1a1a2e, 1).fillRoundedRect(428, 16, 32, 40, 3);
    g.lineStyle(1, 0xef4444, 0.5).strokeRoundedRect(428, 16, 32, 40, 3);
    this.add.text(444, 36, "NO PAIN\nNO GAIN", {
      fontFamily: "Inter, sans-serif", fontSize: "6px", fontStyle: "bold",
      color: "#ef4444", align: "center", lineSpacing: 2,
    }).setOrigin(0.5).setDepth(3);

    // ── Light cones: neon over the training floor, warm over the lounge ────
    const loungeTop = H - LOUNGE_FROM_BOTTOM;
    const lights = [
      { x: 95,  y: BACK_WALL_HEIGHT, color: 0x6c47ff, reach: 210 },
      { x: 240, y: BACK_WALL_HEIGHT, color: 0xf72585, reach: 210 },
      { x: 395, y: BACK_WALL_HEIGHT, color: 0x6c47ff, reach: 210 },
      { x: 150, y: loungeTop,        color: 0xf59e0b, reach: 120 },
      { x: 330, y: loungeTop,        color: 0xf59e0b, reach: 120 },
    ];
    const lightG = this.add.graphics().setDepth(1).setAlpha(0.08);
    lights.forEach((lp) => {
      lightG.fillStyle(lp.color, 1);
      lightG.fillTriangle(lp.x, lp.y, lp.x - 56, lp.y + lp.reach, lp.x + 56, lp.y + lp.reach);
      const arc = this.add.arc(lp.x, lp.y + 2, 5, 0, 360, false, lp.color, 0.75).setDepth(2);
      this.ambientLights.push(arc);
    });

    // ── Glow strips along the zone boundaries ──────────────────────────────
    const stripG = this.add.graphics().setDepth(0).setAlpha(0.18);
    stripG.fillStyle(0x6c47ff, 1).fillRect(16, TRAINING_FLOOR_BOTTOM - 1, W - 32, 2);
    stripG.fillStyle(0xf59e0b, 1).fillRect(16, loungeTop, W - 32, 2);
    this.tweens.add({
      targets: stripG, alpha: 0.32,
      duration: 2000, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });

    this.addFrontOfHouse(W, H);
  }

  // ── Entrance: reception desk, plants, door mat ─────────────────────────────
  private addFrontOfHouse(W: number, H: number) {
    const g = this.add.graphics().setDepth(H - 70);

    // Reception desk — the collection point sits on top of it
    const deskX = 330, deskY = H - 50;
    g.fillStyle(0x1d1830, 1).fillRoundedRect(deskX - 52, deskY - 17, 104, 34, 6);
    g.fillStyle(0x2a2245, 1).fillRoundedRect(deskX - 52, deskY - 17, 104, 9, { tl: 6, tr: 6, bl: 0, br: 0 });
    g.lineStyle(1, 0xffd700, 0.45).strokeRoundedRect(deskX - 52, deskY - 17, 104, 34, 6);
    g.fillStyle(0xffd700, 0.5).fillRect(deskX - 46, deskY + 12, 92, 2);
    this.add.text(deskX, H - 14, "🧾 RECEPTION", {
      fontFamily: "Inter, sans-serif", fontSize: "8px", color: "#6a6a88", letterSpacing: 2,
    }).setOrigin(0.5).setDepth(H);

    // Potted plants either side of the entrance
    for (const px of [60, W - 40]) this.drawPlant(g, px, H - 50);

    // Door mat at the threshold
    g.fillStyle(0x2a2140, 1).fillRoundedRect(W / 2 - 30, H - 17, 60, 10, 3);
    g.lineStyle(1, 0xa78bfa, 0.4).strokeRoundedRect(W / 2 - 30, H - 17, 60, 10, 3);
  }

  private drawPlant(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    // Pot
    g.fillStyle(0x3a2a20, 1).fillRoundedRect(x - 11, y + 6, 22, 16, 3);
    g.fillStyle(0x4a3628, 1).fillRect(x - 13, y + 4, 26, 4);
    // Leaves, layered dark to light
    g.fillStyle(0x0f5132, 1).fillCircle(x - 7, y - 4, 8).fillCircle(x + 7, y - 4, 8);
    g.fillStyle(0x146c43, 1).fillCircle(x, y - 10, 9);
    g.fillStyle(0x1a8754, 0.9).fillCircle(x - 3, y - 14, 5).fillCircle(x + 5, y - 8, 4);
  }

  private drawOpenBay({ x, y }: { x: number; y: number }) {
    const g = this.add.graphics().setDepth(y - 40);
    // Dashed outline traced along the floor ellipse (29 × 8 radii)
    g.lineStyle(1.5, 0x6c47ff, 0.4);
    const point = (deg: number) => {
      const t = Phaser.Math.DegToRad(deg);
      return { px: x + 29 * Math.cos(t), py: y + 22 + 8 * Math.sin(t) };
    };
    for (let a = 0; a < 360; a += 24) {
      const from = point(a);
      const to = point(a + 12);
      g.lineBetween(from.px, from.py, to.px, to.py);
    }
    g.fillStyle(0x6c47ff, 0.05).fillEllipse(x, y + 22, 58, 16);
    this.add.text(x, y + 4, "+ OPEN BAY", {
      fontFamily: "Inter, sans-serif", fontSize: "7px", color: "#4a4a6a", letterSpacing: 1,
    }).setOrigin(0.5).setDepth(y - 39);
  }

  // ── Rooms: yoga studio, sauna, pool ────────────────────────────────────────
  // Each room gets its own walls with a doorway onto the lounge, a tinted floor
  // and an ambient effect, so it reads as a separate space rather than a prop.
  private drawRoomEnclosure(x: number, y: number, color: number, type: string) {
    const w = 86, h = 84;
    const left = x - w / 2, top = y - h / 2;
    const door = 14;
    const g = this.add.graphics().setDepth(y - 60);

    g.fillStyle(color, 0.1).fillRoundedRect(left, top, w, h, 6);

    if (type === "pool") {
      // The water itself, with lane ropes
      g.fillStyle(0x00b4d8, 0.22).fillRoundedRect(left + 8, top + 8, w - 16, h - 30, 4);
      g.lineStyle(1, 0xcaf0f8, 0.35);
      for (let ly = top + 20; ly < top + h - 22; ly += 12) g.lineBetween(left + 10, ly, left + w - 10, ly);
    } else if (type === "sauna") {
      // Cedar slats
      g.lineStyle(1, 0x8a5a33, 0.45);
      for (let ly = top + 8; ly < top + h - 6; ly += 7) g.lineBetween(left + 4, ly, left + w - 4, ly);
    } else if (type === "yogaroom") {
      // Mats laid out on the floor
      g.fillStyle(0xc4b5fd, 0.18);
      g.fillRoundedRect(left + 10, top + 12, 14, 30, 3).fillRoundedRect(left + w - 24, top + 12, 14, 30, 3);
    }

    // Walls on three sides; the front wall has a doorway onto the lounge
    g.lineStyle(2, color, 0.8);
    g.beginPath();
    g.moveTo(x - door, top + h);
    g.lineTo(left, top + h);
    g.lineTo(left, top);
    g.lineTo(left + w, top);
    g.lineTo(left + w, top + h);
    g.lineTo(x + door, top + h);
    g.strokePath();
    g.lineStyle(6, color, 0.12).strokeRoundedRect(left, top, w, h, 6);
    g.fillStyle(color, 0.95).fillRect(x - door - 1, top + h - 4, 3, 8).fillRect(x + door - 2, top + h - 4, 3, 8);

    if (type === "sauna") {
      // Steam rising off the stove
      this.add.particles(x, top + 22, "particle_dust", {
        x: { min: -26, max: 26 },
        lifespan: { min: 1800, max: 2600 },
        speedY: { min: -14, max: -6 },
        speedX: { min: -3, max: 3 },
        scale: { start: 1.2, end: 2.6 },
        alpha: { start: 0.28, end: 0 },
        tint: 0xffe0c0,
        frequency: 240,
      }).setDepth(y + 5);
    } else if (type === "pool") {
      // Light rippling across the water
      for (let i = 0; i < 2; i++) {
        const glint = this.add.rectangle(left + 20 + i * 30, top + 16 + i * 14, 18, 2, 0xcaf0f8, 0.5).setDepth(y - 55);
        this.tweens.add({
          targets: glint, x: glint.x + 14, alpha: 0.1,
          duration: 1600 + i * 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        });
      }
    } else if (type === "yogaroom") {
      // A slow, calm glow
      const aura = this.add.circle(x, y - 6, 26, color, 0.08).setDepth(y - 55);
      this.tweens.add({
        targets: aura, scale: 1.25, alpha: 0.16,
        duration: 3200, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
    }
  }

  // ── Particle systems ────────────────────────────────────────────────────────
  private setupParticles(W: number) {
    // Dust motes drifting through the training floor's light cones
    this.dustEmitter = this.add.particles(0, 0, "particle_dust", {
      x: { min: 24, max: W - 24 },
      y: { min: BACK_WALL_HEIGHT + 10, max: TRAINING_FLOOR_BOTTOM - 10 },
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
  /**
   * Use a gym amenity — a drink, a shower, a spell in the sauna. XP comes back
   * into the pool, on a cooldown the server enforces; the local activate() call
   * is an optimistic lock so a double-tap cannot fire it twice.
   */
  private async useAmenity(prop: RecoveryProp) {
    if (!prop.isReady()) return;
    const spec = amenitySpec(prop.propId);
    if (!spec || spec.xpGain <= 0) return;

    prop.activate(spec.cooldownMs);

    try {
      const res = await fetch("/api/game/gym/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amenity: prop.propId }),
      });
      const data = await res.json();
      if (res.ok) {
        this.incomeSystem.spawnXpGain(prop.x, prop.y - 40, data.xpGained);
        prop.activate(data.cooldownMs);
        EventBus.emit("player:xp_changed", {
          currentXp: data.currentXp,
          overflowXp: data.overflowXp,
          restUntil: data.restUntil ?? null,
        });
      } else {
        prop.activate(0); // not actually on cooldown — let the player retry
        this.incomeSystem.spawnReward(prop.x, prop.y - 40, data.error ?? "Can't use that yet", "#f87171");
      }
    } catch {
      prop.activate(0);
    }
  }

  private addZoneLabel(text: string, x: number, y: number) {
    this.add.text(x, y, text, {
      fontFamily: "Inter, sans-serif",
      fontSize: "8px",
      color: "#25253a",
      letterSpacing: 2,
    }).setOrigin(0.5).setDepth(1);
  }

  // ── Interaction logic ──────────────────────────────────────────────────────
  /** Everything on the floor the player can use right now, and what using it does. */
  private interactables(): Interactable[] {
    return [
      ...this.equipment.map((eq) => ({
        x: eq.x, y: eq.y, reach: 70,
        available: () => !eq.isOccupied,
        use: () => this.activateEquipment(eq),
      })),
      ...this.amenities
        .filter((prop) => prop.xpGain > 0)
        .map((prop) => ({
          x: prop.x, y: prop.y, reach: 70,
          available: () => prop.isReady(),
          use: () => this.useAmenity(prop),
        })),
      {
        x: this.cashPoint.x, y: this.cashPoint.y, reach: 80,
        available: () => true,
        use: () => this.collectIncome(),
      },
    ];
  }

  /**
   * A tap or click on the floor. Tapping something usable walks the player to
   * it and uses it on arrival (or straight away if already there). Tapping
   * empty floor does nothing — walking is the keyboard's or joystick's job.
   */
  private handleTap(worldX: number, worldY: number) {
    if (this.activeEquipment) return; // mid-workout: taps are ignored
    const target = pickTapTarget(this.interactables(), worldX, worldY);
    if (!target) return;

    pingTarget(this, target.x, target.y);
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    if (dist < target.reach) {
      target.use();
      return;
    }
    this.controller.walkTo(target.x, target.y + STAND_OFFSET, () => {
      if (target.available()) target.use();
    });
  }

  /** E / Space: use whatever is within reach of the player. */
  private interactNearby() {
    if (this.activeEquipment) return;
    for (const target of this.interactables()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
      if (dist < target.reach && target.available()) {
        target.use();
        return;
      }
    }
  }

  private collectIncome() {
    const collected = this.incomeSystem.collectPending();
    if (collected > 0) {
      EventBus.emit("income:collected", { amount: collected, x: this.cashPoint.x, y: this.cashPoint.y });
      this.incomeSystem.spawnReward(this.cashPoint.x, this.cashPoint.y - 40, `+${collected} 💰 Collected!`, "#ffd700");
      this.camera.shake(80, 0.002);
      this.spawnCompletionBurst(this.cashPoint.x, this.cashPoint.y - 20);
    } else {
      this.incomeSystem.spawnReward(this.cashPoint.x, this.cashPoint.y - 40, "Nothing to collect yet", "#9aa0b4");
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
    this.cameraRig.update();

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
    for (const prop of this.amenities) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, prop.x, prop.y);
      prop.showPrompt(dist < 70 && prop.xpGain > 0);
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
    if (this.tornDown) return;
    this.tornDown = true;
    EventBus.off("npc:paid", this.onNpcPaid);
    EventBus.off("workout:complete", this.onWorkoutComplete);
    EventBus.off("scene:switch", this.onSceneSwitch);
    EventBus.off("hud:quit_workout", this.onQuitWorkout);
    EventBus.off("player:level_up", this.onLevelUp);
    this.controller.destroy();
    this.cameraRig?.destroy();
    this.dustEmitter?.destroy();
  }
}
