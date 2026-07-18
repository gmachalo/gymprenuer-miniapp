import Phaser from "phaser";

export interface PlayerConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  bodyType: "SKINNY" | "AVERAGE" | "OVERWEIGHT";
  name: string;
  transformationStage: number;
}

const BODY_TYPE_KEY: Record<string, string> = {
  SKINNY:     "char_skinny",
  AVERAGE:    "char_average",
  OVERWEIGHT: "char_overweight",
};

const WORKOUT_KEY: Record<string, string> = {
  SKINNY:     "char_skinny_workout",
  AVERAGE:    "char_average_workout",
  OVERWEIGHT: "char_overweight_workout",
};

export type PlayerState = "IDLE" | "WALKING" | "INTERACTING" | "WORKING_OUT" | "MANAGING";

export class Player extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Image;
  private nameTag: Phaser.GameObjects.Text;
  private stateLabel: Phaser.GameObjects.Text;
  private shadowEllipse: Phaser.GameObjects.Ellipse;
  private glowRing: Phaser.GameObjects.Arc;
  private glowPulse: Phaser.GameObjects.Arc;
  private sweatParticles?: Phaser.GameObjects.Particles.ParticleEmitter;

  private readonly bodyType: string;
  private currentActiveTween: Phaser.Tweens.Tween | null = null;

  state: PlayerState = "IDLE";
  speed = 130;

  constructor(config: PlayerConfig) {
    super(config.scene, config.x, config.y);

    this.bodyType = config.bodyType;

    // ── Shadow ───────────────────────────────────────────────────────────────
    this.shadowEllipse = config.scene.add.ellipse(0, 24, 30, 7, 0x000000, 0.28);
    this.add(this.shadowEllipse);

    // ── Outer pulse ring ────────────────────────────────────────────────────
    this.glowPulse = config.scene.add.arc(0, 0, 30, 0, 360, false, 0x6c47ff, 0);
    this.add(this.glowPulse);

    // ── Player ring ─────────────────────────────────────────────────────────
    this.glowRing = config.scene.add.arc(0, 0, 22, 0, 360, false, 0x6c47ff, 0.2);
    this.add(this.glowRing);
    config.scene.add.image(0, 0, "player_ring").setScale(0.9);

    // ── Character sprite ─────────────────────────────────────────────────────
    const texKey = BODY_TYPE_KEY[config.bodyType] ?? "char_average";
    this.sprite = config.scene.add.image(0, -8, texKey).setScale(0.75);
    this.add(this.sprite);

    // ── Name tag ────────────────────────────────────────────────────────────
    this.nameTag = config.scene.add.text(0, -46, `▶ ${config.name}`, {
      fontFamily: "Inter, sans-serif",
      fontSize: "9px",
      color: "#c4b5fd",
      backgroundColor: "#0d0d1a99",
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5);
    this.add(this.nameTag);

    // ── State label ─────────────────────────────────────────────────────────
    this.stateLabel = config.scene.add.text(0, 28, "", {
      fontFamily: "Inter, sans-serif",
      fontSize: "8px",
      color: "#00d4aa",
      backgroundColor: "#0d0d1a99",
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5).setAlpha(0);
    this.add(this.stateLabel);

    (config.scene.add as Phaser.GameObjects.GameObjectFactory).existing(
      this as unknown as Phaser.GameObjects.GameObject
    );

    // ── Ambient pulsing ring ────────────────────────────────────────────────
    config.scene.tweens.add({
      targets: this.glowPulse,
      fillAlpha: 0.15, scaleX: 1.5, scaleY: 1.5,
      duration: 1400, yoyo: true, repeat: -1,
      ease: "Sine.easeInOut",
    });

    // ── Idle bob ────────────────────────────────────────────────────────────
    this.startIdleAnimation();
  }

  private startIdleAnimation() {
    if (this.currentActiveTween) this.currentActiveTween.stop();
    this.currentActiveTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -12,
      duration: 900,
      yoyo: true, repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  setPlayerState(newState: PlayerState) {
    if (this.state === newState) return;
    const prevState = this.state;
    this.state = newState;

    // ── State label ──────────────────────────────────────────────────────────
    const labels: Partial<Record<PlayerState, string>> = {
      WORKING_OUT: "💪 Working out...",
      MANAGING:    "⚙️ Managing...",
      INTERACTING: "👆 Interacting...",
    };
    const label = labels[newState];
    if (label) {
      this.stateLabel.setText(label).setAlpha(1);
    } else {
      this.stateLabel.setAlpha(0);
    }

    // ── Speed ──────────────────────────────────────────────────────────────
    this.speed = newState === "INTERACTING" ? 60 : newState === "WORKING_OUT" ? 0 : 130;

    // ── Kill previous tweens ────────────────────────────────────────────────
    if (this.currentActiveTween) {
      this.currentActiveTween.stop();
      this.currentActiveTween = null;
    }
    this.scene.tweens.killTweensOf(this.sprite);

    // ── Squash/stretch transition ────────────────────────────────────────────
    void prevState;
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 0.65, scaleY: 0.85,
      duration: 80, yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => this.applyStateAnimation(newState),
    });
  }

  private applyStateAnimation(state: PlayerState) {
    switch (state) {
      case "WORKING_OUT": {
        // Swap to workout sprite
        const workoutTex = WORKOUT_KEY[this.bodyType] ?? "char_average_workout";
        if (this.scene.textures.exists(workoutTex)) {
          this.sprite.setTexture(workoutTex);
        }
        // Pump animation
        this.currentActiveTween = this.scene.tweens.add({
          targets: this.sprite,
          y: -18, scaleY: 0.72,
          duration: 380,
          yoyo: true, repeat: -1,
          ease: "Sine.easeInOut",
        });
        // Intensify ring
        this.scene.tweens.add({ targets: this.glowRing, fillAlpha: 0.4, duration: 300 });
        // Spawn sweat particles
        this.startSweatParticles();
        break;
      }
      case "IDLE": {
        // Restore idle sprite
        const idleTex = BODY_TYPE_KEY[this.bodyType] ?? "char_average";
        this.sprite.setTexture(idleTex);
        this.stopSweatParticles();
        this.startIdleAnimation();
        this.scene.tweens.add({ targets: this.glowRing, fillAlpha: 0.2, duration: 400 });
        break;
      }
      case "WALKING": {
        this.currentActiveTween = this.scene.tweens.add({
          targets: this.sprite,
          y: -6,
          duration: 220,
          yoyo: true, repeat: -1,
          ease: "Sine.easeInOut",
        });
        break;
      }
      default:
        this.startIdleAnimation();
    }
  }

  private startSweatParticles() {
    if (this.sweatParticles) return;
    if (!this.scene.textures.exists("particle_sweat")) return;
    this.sweatParticles = this.scene.add.particles(this.x, this.y - 20, "particle_sweat", {
      speedX: { min: -15, max: 15 },
      speedY: { min: -20, max: -5 },
      lifespan: 700,
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.8, end: 0 },
      frequency: 400,
      quantity: 1,
    });
    this.sweatParticles.setDepth(this.depth + 1);
  }

  private stopSweatParticles() {
    if (this.sweatParticles) {
      this.sweatParticles.stop();
      this.scene.time.delayedCall(800, () => {
        this.sweatParticles?.destroy();
        this.sweatParticles = undefined;
      });
    }
  }

  // Follow player position for sweat emitter
  updateDepth() {
    this.setDepth(this.y + 32);
    if (this.sweatParticles) {
      this.sweatParticles.setPosition(this.x, this.y - 20);
    }
  }
}
