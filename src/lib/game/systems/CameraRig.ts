import Phaser from "phaser";
import { EventBus } from "@/lib/game/EventBus";

/** How much of the canvas the React HUD covers, in CSS pixels. */
export interface HudInsets {
  top: number;
  bottom: number;
}

const LERP = 0.08;

/**
 * Camera behaviour shared by the walkable scenes.
 *
 * The world is exactly one screen, but the React HUD sits on top of it — the
 * stats bar across the top, the scene switcher and app nav along the bottom. A
 * camera bounded to the world could never reveal what is underneath them, so
 * the bounds are padded by the covered amounts and the player is centred in
 * the visible gap rather than the full canvas.
 *
 * The mouse wheel pans the view (detaching it from the player until they next
 * move); ctrl+wheel — which is also what a trackpad pinch sends — zooms.
 */
export class CameraRig {
  private insets: HudInsets = { top: 0, bottom: 0 };
  private following = true;
  private lastPlayerX: number;
  private lastPlayerY: number;

  private readonly onInsets = (insets: HudInsets) => {
    this.scene.registry.set("hudInsets", insets);
    this.applyInsets(insets);
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly player: Phaser.GameObjects.Components.Transform,
    private readonly width: number,
    private readonly height: number
  ) {
    this.lastPlayerX = player.x;
    this.lastPlayerY = player.y;

    camera.setBounds(0, 0, width, height);
    camera.startFollow(player, true, LERP, LERP);

    // A scene started after the HUD measured itself picks the insets up here.
    const known = scene.registry.get("hudInsets") as HudInsets | undefined;
    if (known) this.applyInsets(known);
    EventBus.on("hud:insets", this.onInsets);

    // Keep the page from scrolling underneath while the wheel pans the scene.
    if (scene.input.mouse) scene.input.mouse.preventDefaultWheel = true;
    scene.input.on("wheel", this.onWheel, this);
  }

  /** Re-attach to the player once they start walking again. */
  update() {
    const moved =
      Math.abs(this.player.x - this.lastPlayerX) > 0.5 ||
      Math.abs(this.player.y - this.lastPlayerY) > 0.5;
    this.lastPlayerX = this.player.x;
    this.lastPlayerY = this.player.y;

    if (moved && !this.following) {
      this.following = true;
      this.follow();
    }
  }

  destroy() {
    EventBus.off("hud:insets", this.onInsets);
    this.scene.input.off("wheel", this.onWheel, this);
  }

  private follow() {
    const offset = this.followOffset();
    this.camera.startFollow(this.player, true, LERP, LERP, 0, offset);
  }

  /**
   * Centre the player in the gap between the overlays: shifting the follow
   * target by half the difference between the two covered bands.
   */
  private followOffset(): number {
    const ratio = this.scene.scale.displayScale.y; // logical px per CSS px
    return ((this.insets.top - this.insets.bottom) * ratio) / 2;
  }

  private applyInsets(insets: HudInsets) {
    this.insets = insets;
    const ratio = this.scene.scale.displayScale.y;
    const top = Math.max(0, insets.top) * ratio;
    const bottom = Math.max(0, insets.bottom) * ratio;
    // Room to scroll exactly as far as each overlay reaches into the world.
    this.camera.setBounds(0, -top, this.width, this.height + top + bottom);
    if (this.following) this.follow();
  }

  private onWheel(
    pointer: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number
  ) {
    const event = pointer.event as WheelEvent | undefined;
    if (event?.ctrlKey) {
      const zoom = Phaser.Math.Clamp(this.camera.zoom - dy * 0.002, 0.65, 2);
      this.scene.tweens.add({ targets: this.camera, zoom, duration: 150, ease: "Sine.easeOut" });
      return;
    }
    if (this.following) {
      this.camera.stopFollow();
      this.following = false;
    }
    // Bounds clamp this on the next render.
    this.camera.scrollY += dy * 0.6;
  }
}
