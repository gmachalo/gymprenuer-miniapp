import Phaser from "phaser";
import { EventBus } from "@/lib/game/EventBus";

export type NpcState = "ENTERING" | "WALKING_TO_EQUIPMENT" | "WAITING" | "WORKING_OUT" | "WALKING_OUT" | "DONE";

const NPC_TEXTURES = ["char_npc_f", "char_npc_m", "char_npc_g", "char_npc_y", "char_npc"];
const THOUGHT_EMOJIS_WORKOUT  = ["💪", "🔥", "😤", "⚡", "💦"];
const THOUGHT_EMOJIS_WAITING  = ["😒", "⏰", "😑", "🙄"];
const THOUGHT_EMOJIS_HAPPY    = ["😊", "👍", "✨", "🏆"];

export class Npc extends Phaser.GameObjects.Container {
  readonly npcId: string;
  npcState: NpcState = "ENTERING";
  satisfaction = 100;
  targetEquipmentId: string | null = null;

  private sprite: Phaser.GameObjects.Image;
  private satisfactionBar: Phaser.GameObjects.Graphics;
  private satisfactionFill: Phaser.GameObjects.Graphics;
  private shadowEllipse: Phaser.GameObjects.Ellipse;
  private thoughtBubble!: Phaser.GameObjects.Container;
  private thoughtText!: Phaser.GameObjects.Text;
  private workoutTimer = 0;
  private readonly payAmount: number;
  private thoughtTimer = 0;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private workoutTween: Phaser.Tweens.Tween | null = null;
  private nameTag: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, payAmount: number) {
    super(scene, x, y);
    this.npcId = `npc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.payAmount = payAmount;

    // Shadow
    this.shadowEllipse = scene.add.ellipse(0, 22, 26, 7, 0x000000, 0.22);
    this.add(this.shadowEllipse);

    // Character sprite (random NPC type)
    const texKey = NPC_TEXTURES[Math.floor(Math.random() * NPC_TEXTURES.length)];
    this.sprite = scene.add.image(0, 0, texKey).setScale(0.7);
    this.add(this.sprite);

    // Name tag (tiny, barely visible — premium subtle detail)
    const names = ["Alex", "Sam", "Jordan", "Casey", "Riley", "Morgan", "Taylor"];
    const name = names[Math.floor(Math.random() * names.length)];
    this.nameTag = scene.add.text(0, -32, name, {
      fontFamily: "Inter, sans-serif", fontSize: "8px",
      color: "#505068", backgroundColor: "#0d0d1a99",
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5).setAlpha(0);
    this.add(this.nameTag);

    // Satisfaction bar (background)
    this.satisfactionBar = scene.add.graphics();
    this.satisfactionBar.fillStyle(0x1a1a2e, 0.9).fillRoundedRect(-14, -26, 28, 4, 2);
    this.add(this.satisfactionBar);

    // Satisfaction fill
    this.satisfactionFill = scene.add.graphics();
    this.add(this.satisfactionFill);
    this.drawSatisfactionBar();

    // Thought bubble (hidden by default)
    this.thoughtBubble = scene.add.container(18, -28);
    const bubbleBg = scene.add.ellipse(0, 0, 24, 18, 0xffffff, 0.92).setStrokeStyle(1, 0xcccccc, 0.8);
    const bubbleTail = scene.add.ellipse(-8, 8, 8, 6, 0xffffff, 0.92);
    this.thoughtText = scene.add.text(0, 0, "💪", { fontSize: "11px" }).setOrigin(0.5);
    this.thoughtBubble.add([bubbleTail, bubbleBg, this.thoughtText]);
    this.thoughtBubble.setAlpha(0).setScale(0.5);
    this.add(this.thoughtBubble);

    scene.add.existing(this);
    this.setDepth(y);

    // Enter animation — fade + slide up
    this.setAlpha(0).setY(y + 20);
    scene.tweens.add({
      targets: this,
      y, alpha: 1,
      duration: 400,
      ease: "Back.easeOut",
    });

    // Start idle bob
    this.startIdleAnim();

    // Show name on proximity (handled externally, default hidden)
    EventBus.emit("npc:entered", { npcId: this.npcId });
  }

  private startIdleAnim() {
    if (this.idleTween) this.idleTween.stop();
    this.idleTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -3,
      duration: 800 + Math.random() * 300,
      yoyo: true, repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private drawSatisfactionBar() {
    this.satisfactionFill.clear();
    const pct = this.satisfaction / 100;
    const w = 28;
    const color = pct > 0.6 ? 0x00d4aa : pct > 0.3 ? 0xf59e0b : 0xef4444;
    const fillW = Math.max(0, w * pct);
    if (fillW > 0) {
      this.satisfactionFill.fillStyle(color, 1);
      this.satisfactionFill.fillRoundedRect(-14, -26, fillW, 4, 2);
      // Sheen on bar
      this.satisfactionFill.fillStyle(0xffffff, 0.25);
      this.satisfactionFill.fillRoundedRect(-14, -26, fillW, 2, 2);
    }
  }

  private showThought(emoji: string) {
    this.thoughtText.setText(emoji);
    this.scene.tweens.add({
      targets: this.thoughtBubble,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 250, ease: "Back.easeOut",
    });
    this.scene.time.delayedCall(2200, () => {
      if (!this.active) return;
      this.scene.tweens.add({
        targets: this.thoughtBubble,
        alpha: 0, scaleX: 0.5, scaleY: 0.5,
        duration: 200,
      });
    });
  }

  showNameTag(visible: boolean) {
    this.scene.tweens.add({
      targets: this.nameTag,
      alpha: visible ? 0.9 : 0,
      duration: 200,
    });
  }

  walkTo(scene: Phaser.Scene, tx: number, ty: number, onComplete?: () => void) {
    if (this.idleTween) this.idleTween.stop();

    const dur = Phaser.Math.Distance.Between(this.x, this.y, tx, ty) / 0.095;
    scene.tweens.add({
      targets: this,
      x: tx, y: ty,
      duration: Phaser.Math.Clamp(dur, 800, 6000),
      ease: "Sine.easeInOut",
      onComplete,
      onUpdate: () => {
        this.setDepth(this.y);
        this.sprite.setFlipX(tx < this.x);
        // Walking bob
        this.sprite.y = Math.sin(Date.now() * 0.012) * 2.5;
      },
    });
  }

  startWorkout() {
    this.npcState = "WORKING_OUT";
    this.workoutTimer = 0;
    if (this.idleTween) this.idleTween.stop();

    // Swap to workout sprite if available
    const workoutTex = this.sprite.texture.key.replace("char_npc", "char_npc") + "_workout";
    if (this.scene.textures.exists(workoutTex)) {
      this.sprite.setTexture(workoutTex);
    }

    // Workout pump animation
    this.workoutTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -10, scaleX: 0.75, scaleY: 0.72,
      duration: 320,
      yoyo: true, repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Show workout thought
    this.time_delayedShow(500, THOUGHT_EMOJIS_WORKOUT);
  }

  private time_delayedShow(delay: number, pool: string[]) {
    this.scene.time.delayedCall(delay, () => {
      if (this.active && (this.npcState === "WORKING_OUT" || this.npcState === "WAITING")) {
        this.showThought(pool[Math.floor(Math.random() * pool.length)]);
      }
    });
  }

  updateWorkout(delta: number): boolean {
    if (this.npcState !== "WORKING_OUT") return false;
    this.workoutTimer += delta;
    this.satisfaction = Math.min(100, this.satisfaction + 0.005 * delta);
    this.drawSatisfactionBar();

    // Periodic thought bubbles
    this.thoughtTimer += delta;
    if (this.thoughtTimer > 6000) {
      this.thoughtTimer = 0;
      this.showThought(THOUGHT_EMOJIS_WORKOUT[Math.floor(Math.random() * THOUGHT_EMOJIS_WORKOUT.length)]);
    }

    const WORKOUT_DURATION = 20_000 + Math.random() * 15_000;
    return this.workoutTimer >= WORKOUT_DURATION;
  }

  decreaseSatisfaction(amount: number) {
    this.satisfaction = Math.max(0, this.satisfaction - amount);
    this.drawSatisfactionBar();
    // Show dissatisfied thought when low
    if (this.satisfaction < 40 && Math.random() < 0.002) {
      this.showThought(THOUGHT_EMOJIS_WAITING[Math.floor(Math.random() * THOUGHT_EMOJIS_WAITING.length)]);
    }
    if (this.satisfaction <= 0) this.leave(true);
  }

  leave(dissatisfied = false) {
    this.npcState = "DONE";
    if (this.idleTween) this.idleTween.stop();
    if (this.workoutTween) this.workoutTween.stop();
    this.scene.tweens.killTweensOf(this.sprite);

    // Happy thought on leave (satisfied)
    if (!dissatisfied) {
      this.showThought(THOUGHT_EMOJIS_HAPPY[Math.floor(Math.random() * THOUGHT_EMOJIS_HAPPY.length)]);
      EventBus.emit("npc:paid", { amount: this.payAmount });
    } else {
      EventBus.emit("npc:left_dissatisfied", { npcId: this.npcId });
    }

    // Wave animation before leaving
    this.scene.tweens.add({
      targets: this.sprite,
      angle: dissatisfied ? -15 : 20,
      duration: 200, yoyo: true, repeat: 1,
      onComplete: () => {
        // Slide-out fade
        this.scene.tweens.add({
          targets: this,
          y: this.y - 30,
          alpha: 0,
          duration: 500,
          ease: "Sine.easeIn",
          onComplete: () => this.destroy(),
        });
      },
    });
  }
}
