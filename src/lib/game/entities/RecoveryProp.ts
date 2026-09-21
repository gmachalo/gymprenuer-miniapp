import Phaser from "phaser";

export interface RecoveryPropConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  /** Home recovery item id, or a gym amenity catalog key. */
  id: string;
  label: string;
  verb: string;
  textureKey: string;
  xpGain: number;
  accentColor: number;
}

// A HomeScene interactable that grants XP back to the pool on a cooldown —
// the inverse of Equipment (which spends XP over a timed workout). No
// progress bar or occupied state: activation is instant, gated server-side.
export class RecoveryProp extends Phaser.GameObjects.Container {
  readonly propId: string;
  readonly label: string;
  readonly verb: string;
  readonly xpGain: number;
  interactionZone: Phaser.Geom.Circle;

  private sprite: Phaser.GameObjects.Image;
  private glowRing: Phaser.GameObjects.Arc;
  private glowPulse: Phaser.GameObjects.Arc;
  private promptContainer!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private isPromptVisible = false;
  private cooldownUntil = 0; // client-side clock (ms), for display only — server enforces the real gate

  constructor(config: RecoveryPropConfig) {
    super(config.scene, config.x, config.y);

    this.propId = config.id;
    this.label = config.label;
    this.verb = config.verb;
    this.xpGain = config.xpGain;
    this.interactionZone = new Phaser.Geom.Circle(config.x, config.y, 64);

    this.glowPulse = config.scene.add.arc(0, 0, 46, 0, 360, false, config.accentColor, 0).setDepth(-2);
    this.add(this.glowPulse);
    this.glowRing = config.scene.add.arc(0, 0, 36, 0, 360, false, config.accentColor, 0).setDepth(-1);
    this.add(this.glowRing);

    this.sprite = config.scene.add.image(0, 0, config.textureKey).setScale(0.85);
    this.add(this.sprite);

    const nameLabel = config.scene.add
      .text(0, 36, config.label, {
        fontFamily: "Inter, sans-serif", fontSize: "8px",
        color: "#6a6a88", backgroundColor: "#00000055",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);
    this.add(nameLabel);

    this.buildPrompt(config.accentColor);

    config.scene.add.existing(this);
    this.setDepth(config.y);

    // Ambient idle bob + glow, same language as Equipment
    config.scene.tweens.add({
      targets: this.sprite,
      y: -2, duration: 2000 + Math.random() * 600,
      yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
    config.scene.tweens.add({
      targets: this.glowPulse,
      fillAlpha: 0.14, scaleX: 1.12, scaleY: 1.12,
      duration: 2400 + Math.random() * 800,
      yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
  }

  private buildPrompt(accentColor: number) {
    this.promptContainer = this.scene.add.container(0, -50);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95).fillRoundedRect(-50, -12, 100, 22, 8);
    bg.lineStyle(1, accentColor, 0.5).strokeRoundedRect(-50, -12, 100, 22, 8);

    this.promptText = this.scene.add.text(0, 0, "", {
      fontFamily: "Inter, sans-serif", fontSize: "9px",
      color: "#c4b5fd",
    }).setOrigin(0.5);

    const arrow = this.scene.add.text(0, 14, "▼", {
      fontSize: "8px", color: `#${accentColor.toString(16).padStart(6, "0")}66`,
    }).setOrigin(0.5);

    this.promptContainer.add([bg, this.promptText, arrow]);
    this.promptContainer.setAlpha(0);
    this.add(this.promptContainer);
  }

  private onCooldown(): boolean {
    return Date.now() < this.cooldownUntil;
  }

  showPrompt(visible: boolean) {
    if (this.isPromptVisible === visible) return;
    this.isPromptVisible = visible;

    if (visible) {
      this.promptText.setText(
        this.onCooldown()
          ? `⏳ ${Math.ceil((this.cooldownUntil - Date.now()) / 60_000)}m left`
          : `${this.verb} → +${this.xpGain} XP`
      );
    }

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
      fillAlpha: visible ? 0.28 : 0,
      duration: 250,
    });
  }

  /** Mark this prop as just-used (cooldownMs from the server) and play a feedback pulse. */
  activate(cooldownMs: number) {
    this.cooldownUntil = Date.now() + cooldownMs;
    this.showPrompt(false);
    this.isPromptVisible = false;

    this.sprite.setTint(0xffffff);
    this.scene.time.delayedCall(150, () => {
      if (this.sprite?.active) this.sprite.clearTint();
    });
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.12, scaleY: 1.12,
      duration: 150, yoyo: true, ease: "Back.easeOut",
    });
    this.scene.tweens.add({
      targets: this.glowRing,
      fillAlpha: 0.4, duration: 200, yoyo: true,
    });
  }

  isReady(): boolean {
    return !this.onCooldown();
  }
}
