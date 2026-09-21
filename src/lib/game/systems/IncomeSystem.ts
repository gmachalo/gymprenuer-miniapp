import Phaser from "phaser";

// Floating reward text pool — reusable text objects
const POOL_SIZE = 20;

export class IncomeSystem {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Text[] = [];
  private pendingIncome = 0;
  private incomeIndicators: Map<string, Phaser.GameObjects.Image> = new Map();
  // Phaser destroys the whole display list on scene teardown, but this system is
  // reachable from the global EventBus (npc:paid), which outlives the scene. A
  // late emission would otherwise draw into an already-destroyed Text canvas.
  private alive = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneTeardown, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.handleSceneTeardown, this);
    // Pre-create pool
    for (let i = 0; i < POOL_SIZE; i++) {
      const t = scene.add
        .text(0, 0, "", {
          fontFamily: "Inter, sans-serif",
          fontSize: "16px",
          fontStyle: "bold",
          color: "#ffd700",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setAlpha(0)
        .setDepth(500);
      this.pool.push(t);
    }
  }

  // Drops the pool so nothing here can touch a destroyed game object. Pending
  // income is kept — it is plain state the next scene reads back on collect.
  private handleSceneTeardown() {
    this.alive = false;
    this.pool = [];
    this.incomeIndicators.clear();
  }

  spawnReward(worldX: number, worldY: number, text: string, color = "#ffd700") {
    if (!this.alive) return;
    // `t.scene` is the liveness check: Phaser's GameObject.destroy() sets it to
    // undefined (along with active/visible), and reading it afterwards is safe.
    // Belt-and-braces with the `alive` flag — a destroyed Text has a null canvas
    // context, so setText() on one throws inside drawImage.
    const available = this.pool.find((t) => t.scene && t.alpha === 0);
    if (!available) return;

    available
      .setText(text)
      .setColor(color)
      .setPosition(worldX, worldY)
      .setAlpha(1)
      .setScale(0.5);

    this.scene.tweens.add({
      targets: available,
      y: worldY - 60,
      alpha: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 1400,
      ease: "Cubic.easeOut",
      onComplete: () => available.setAlpha(0),
    });
  }

  spawnXpCost(worldX: number, worldY: number, xp: number) {
    this.spawnReward(worldX, worldY - 20, `-${xp} XP`, "#f87171");
  }

  spawnXpGain(worldX: number, worldY: number, xp: number) {
    this.spawnReward(worldX, worldY - 20, `+${xp} XP`, "#00d4aa");
  }

  spawnTokenReward(worldX: number, worldY: number, tokens: number) {
    this.spawnReward(worldX, worldY, `+${tokens} 🪙`, "#ffd700");
  }

  spawnNpcPay(worldX: number, worldY: number, amount: number) {
    this.spawnReward(worldX, worldY, `💰 +${amount}`, "#00d4aa");
    this.pendingIncome += amount;
  }

  addIncomeIndicator(zoneId: string, x: number, y: number) {
    if (!this.alive) return;
    if (this.incomeIndicators.has(zoneId)) return;
    const ind = this.scene.add
      .image(x, y - 20, "income_indicator")
      .setDepth(300);

    // Pulse animation
    this.scene.tweens.add({
      targets: ind,
      y: y - 28,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.incomeIndicators.set(zoneId, ind);
  }

  removeIncomeIndicator(zoneId: string) {
    if (!this.alive) return;
    const ind = this.incomeIndicators.get(zoneId);
    if (ind) {
      this.scene.tweens.killTweensOf(ind);
      ind.destroy();
      this.incomeIndicators.delete(zoneId);
    }
  }

  collectPending(): number {
    const amount = this.pendingIncome;
    this.pendingIncome = 0;
    return amount;
  }

  getPending(): number {
    return this.pendingIncome;
  }
}
