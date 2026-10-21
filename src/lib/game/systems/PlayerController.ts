import Phaser from "phaser";
import { Player } from "@/lib/game/entities/Player";

// ── Joystick config ──────────────────────────────────────────────────────────
const JOYSTICK_RADIUS = 50;
/** A touch has to travel this far (logical px) before it becomes a joystick drag. */
const DRAG_THRESHOLD = 10;
/** Lowest the player may stand: clear of the floor edge, at or below the gym's spawn point. */
const BOTTOM_MARGIN = 50;
/** How close an auto-walk has to get before it counts as arrived. */
const ARRIVE_DISTANCE = 6;

// ── Tap-to-use helpers ───────────────────────────────────────────────────────

/** Something on the floor a tap can target. */
export interface Interactable {
  x: number;
  y: number;
  /** How close the player must stand to use it. */
  reach: number;
  available: () => boolean;
  use: () => void;
}

/** How far a tap may land from a target's centre and still pick it. */
const TAP_RADIUS = 52;
/** Where the player stands to use something: just in front of (below) it. */
export const STAND_OFFSET = 48;

/**
 * The usable target nearest to a tap, if the tap landed on one. Measured to a
 * point a little below the sprite's centre, so tapping its name label counts.
 */
export function pickTapTarget(targets: Interactable[], worldX: number, worldY: number): Interactable | null {
  let best: Interactable | null = null;
  let bestDist = TAP_RADIUS;
  for (const t of targets) {
    if (!t.available()) continue;
    const d = Phaser.Math.Distance.Between(worldX, worldY, t.x, t.y + 10);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/** A brief ring on the tapped target, so the tap visibly registered. */
export function pingTarget(scene: Phaser.Scene, x: number, y: number) {
  const ring = scene.add.circle(x, y + 22, 18).setStrokeStyle(2, 0xa78bfa, 0.9).setDepth(y + 1);
  scene.tweens.add({
    targets: ring, scale: 1.8, alpha: 0,
    duration: 420, ease: "Sine.easeOut",
    onComplete: () => ring.destroy(),
  });
}

/**
 * Turns input into player movement.
 *
 * - Keyboard (WASD / arrows) walks; E or Space interacts with whatever is near.
 * - A tap or click is a tap: it goes to `onTapCallback` with the world point,
 *   and the scene decides what was tapped (and may `walkTo` it).
 * - A touch that is dragged becomes a virtual joystick, shown only while held.
 *
 * The joystick releases on every way a press can end — pointerup inside or
 * outside the canvas, the pointer leaving the game, the window losing focus —
 * so it can never stick on and keep steering the player.
 */
export class PlayerController {
  private scene: Phaser.Scene;
  private player: Player;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };

  // Virtual joystick state
  private joystickBase!: Phaser.GameObjects.Image;
  private joystickThumb!: Phaser.GameObjects.Image;
  private joystickActive = false;
  private joystickOrigin = new Phaser.Math.Vector2();
  private joystickVector = new Phaser.Math.Vector2();

  // The press currently being tracked, until it ends as a tap or a drag
  private pressId = -1;
  private pressStart = new Phaser.Math.Vector2();
  private pressIsTouch = false;

  // Auto-walk toward a tapped target
  private walkTarget: { x: number; y: number; onArrive?: () => void } | null = null;

  /** Called with the world point of a tap or click (not of a joystick drag). */
  onTapCallback?: (worldX: number, worldY: number) => void;
  /** Called when the interact key (E / Space) is pressed. */
  onInteractKey?: () => void;

  private readonly onBlur = () => this.endPress();

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene;
    this.player = player;
    this.setupKeyboard();
    this.setupPointer();
  }

  /** Walk straight to a point, then call `onArrive`. Any manual input cancels it. */
  walkTo(x: number, y: number, onArrive?: () => void) {
    this.walkTarget = {
      x: Phaser.Math.Clamp(x, 40, this.scene.scale.width - 40),
      y: Phaser.Math.Clamp(y, 40, this.scene.scale.height - BOTTOM_MARGIN),
      onArrive,
    };
  }

  cancelWalk() {
    this.walkTarget = null;
  }

  private setupKeyboard() {
    if (!this.scene.input.keyboard) return;
    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.wasd = {
      up:    this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.scene.input.keyboard.on("keydown-E", this.handleInteractKey, this);
    this.scene.input.keyboard.on("keydown-SPACE", this.handleInteractKey, this);
  }

  private handleInteractKey() {
    this.onInteractKey?.();
  }

  private setupPointer() {
    // Hidden until a touch is actually dragged; a fixed stick in the corner
    // covered part of the floor on desktop, where it is never used.
    this.joystickBase = this.scene.add
      .image(0, 0, "joystick_base")
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false);
    this.joystickThumb = this.scene.add
      .image(0, 0, "joystick_thumb")
      .setScrollFactor(0)
      .setDepth(201)
      .setVisible(false);

    const input = this.scene.input;
    input.on("pointerdown", this.onPointerDown, this);
    input.on("pointermove", this.onPointerMove, this);
    input.on("pointerup", this.onPointerUp, this);
    input.on("pointerupoutside", this.onPointerUp, this);
    input.on("gameout", this.onBlur, this);
    this.scene.game.events.on(Phaser.Core.Events.BLUR, this.onBlur);
  }

  private onPointerDown(ptr: Phaser.Input.Pointer) {
    if (this.pressId !== -1) return; // already tracking another finger
    this.pressId = ptr.id;
    this.pressStart.set(ptr.x, ptr.y);
    this.pressIsTouch = ptr.wasTouch;
  }

  private onPointerMove(ptr: Phaser.Input.Pointer) {
    // Mouse movement with no button held is not a press at all.
    if (ptr.id !== this.pressId || !ptr.isDown) return;

    if (!this.joystickActive) {
      const travelled = Phaser.Math.Distance.Between(this.pressStart.x, this.pressStart.y, ptr.x, ptr.y);
      if (!this.pressIsTouch || travelled < DRAG_THRESHOLD) return;
      // A dragged touch: becomes the joystick, anchored where it started.
      this.joystickActive = true;
      this.walkTarget = null;
      this.joystickOrigin.copy(this.pressStart);
      this.joystickBase.setPosition(this.pressStart.x, this.pressStart.y).setVisible(true).setAlpha(0.7);
      this.joystickThumb.setPosition(this.pressStart.x, this.pressStart.y).setVisible(true).setAlpha(1);
    }

    const dx = ptr.x - this.joystickOrigin.x;
    const dy = ptr.y - this.joystickOrigin.y;
    const clamped = Math.min(Math.sqrt(dx * dx + dy * dy), JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    this.joystickThumb.setPosition(
      this.joystickOrigin.x + Math.cos(angle) * clamped,
      this.joystickOrigin.y + Math.sin(angle) * clamped
    );
    this.joystickVector.set(
      (clamped / JOYSTICK_RADIUS) * Math.cos(angle),
      (clamped / JOYSTICK_RADIUS) * Math.sin(angle)
    );
  }

  private onPointerUp(ptr: Phaser.Input.Pointer) {
    if (ptr.id !== this.pressId) return;
    const wasDrag = this.joystickActive;
    const travelled = Phaser.Math.Distance.Between(this.pressStart.x, this.pressStart.y, ptr.x, ptr.y);
    this.endPress();
    // A press that neither dragged the joystick nor wandered off is a tap.
    if (!wasDrag && travelled < DRAG_THRESHOLD) {
      this.onTapCallback?.(ptr.worldX, ptr.worldY);
    }
  }

  private endPress() {
    this.pressId = -1;
    this.joystickActive = false;
    this.joystickVector.reset();
    this.joystickBase.setVisible(false);
    this.joystickThumb.setVisible(false);
  }

  update(delta: number) {
    if (this.player.state === "WORKING_OUT") {
      this.walkTarget = null;
      return;
    }

    const speed = this.player.speed;
    const dt = delta / 1000;
    let vx = 0;
    let vy = 0;

    // Keyboard input
    if (this.cursors?.left.isDown  || this.wasd?.left.isDown)  vx -= 1;
    if (this.cursors?.right.isDown || this.wasd?.right.isDown) vx += 1;
    if (this.cursors?.up.isDown    || this.wasd?.up.isDown)    vy -= 1;
    if (this.cursors?.down.isDown  || this.wasd?.down.isDown)  vy += 1;

    // Joystick input
    if (this.joystickActive) {
      vx += this.joystickVector.x;
      vy += this.joystickVector.y;
    }

    // Normalize diagonal
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    if (vx !== 0 || vy !== 0) {
      // Steering by hand always wins over an auto-walk in progress.
      this.walkTarget = null;
    } else if (this.walkTarget) {
      const dx = this.walkTarget.x - this.player.x;
      const dy = this.walkTarget.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ARRIVE_DISTANCE) {
        const arrive = this.walkTarget.onArrive;
        this.walkTarget = null;
        this.player.setPlayerState("IDLE");
        arrive?.();
        return;
      }
      // Never overshoot the target on a long frame.
      const step = Math.min(1, dist / (speed * dt));
      vx = (dx / dist) * step;
      vy = (dy / dist) * step;
    }

    if (vx !== 0 || vy !== 0) {
      this.player.x = Phaser.Math.Clamp(this.player.x + vx * speed * dt, 40, this.scene.scale.width - 40);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy * speed * dt, 40, this.scene.scale.height - BOTTOM_MARGIN);
      this.player.setPlayerState("WALKING");
      this.player.updateDepth();

      // Flip sprite on horizontal direction
      const sp = this.player.getAt(2) as Phaser.GameObjects.Image;
      if (sp?.setFlipX && Math.abs(vx) > 0.05) sp.setFlipX(vx < 0);
    } else if (this.player.state === "WALKING") {
      this.player.setPlayerState("IDLE");
    }
  }

  destroy() {
    const input = this.scene.input;
    input.off("pointerdown", this.onPointerDown, this);
    input.off("pointermove", this.onPointerMove, this);
    input.off("pointerup", this.onPointerUp, this);
    input.off("pointerupoutside", this.onPointerUp, this);
    input.off("gameout", this.onBlur, this);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.onBlur);
    input.keyboard?.off("keydown-E", this.handleInteractKey, this);
    input.keyboard?.off("keydown-SPACE", this.handleInteractKey, this);
  }
}
