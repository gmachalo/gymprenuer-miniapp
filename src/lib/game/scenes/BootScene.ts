import Phaser from "phaser";
import { EventBus } from "@/lib/game/EventBus";

// BootScene â€” generates all premium isometric cartoon game textures procedurally
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;

    // Premium loading bar with glow
    const barBg = this.add.rectangle(cx, cy, 320, 8, 0x1a1030, 1).setDepth(100);
    const barGlow = this.add.rectangle(cx, cy, 320, 8, 0x6c47ff, 0.1).setDepth(99);
    const bar = this.add.rectangle(cx - 160, cy, 0, 8, 0x6c47ff, 1).setOrigin(0, 0.5).setDepth(101);
    const barSheen = this.add.rectangle(cx - 160, cy - 2, 0, 3, 0xa78bfa, 0.6).setOrigin(0, 0.5).setDepth(102);
    this.add.text(cx, cy - 28, "GYM TYCOON", {
      fontFamily: "Inter,sans-serif", fontSize: "11px", color: "#6c47ff",
      letterSpacing: 6,
    }).setOrigin(0.5).setDepth(101);
    this.add.text(cx, cy + 22, "Loading...", {
      fontFamily: "Inter,sans-serif", fontSize: "10px", color: "#4a4460",
    }).setOrigin(0.5).setDepth(101);
    this.load.on("progress", (v: number) => {
      bar.width = 320 * v;
      barSheen.width = 320 * v;
      barGlow.width = 320 * v + 20;
    });
    void barBg;
  }

  create() {
    this.generateTextures();
    EventBus.emit("scene:ready", { name: "BootScene" });
    this.scene.start("GymScene");
  }

  private generateTextures() {
    const g = this.make.graphics({ x: 0, y: 0 });

    // Phaser's types require Vector2[] but plain {x,y}[] works at runtime
    type XY = { x: number; y: number };
    const fillPoly  = (pts: XY[], close = true) => g.fillPoints(pts as unknown as Phaser.Math.Vector2[], close);
    const strokePoly = (pts: XY[], close = true) => g.strokePoints(pts as unknown as Phaser.Math.Vector2[], close);

    // â”€â”€ ISO FLOOR TILES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const drawIsoTile = (
      topColor: number,
      lineColor: number,
      opts: { sheen?: boolean; dots?: boolean; planks?: boolean } = {},
      w = 64, h = 32
    ) => {
      g.clear();
      // Main fill
      g.fillStyle(topColor, 1);
      fillPoly([{ x: w/2, y: 0 }, { x: w, y: h/2 }, { x: w/2, y: h }, { x: 0, y: h/2 }], true);
      // Inner gradient sheen (lighter top half)
      const lighterTop = Phaser.Display.Color.ValueToColor(topColor).lighten(12).color;
      g.fillStyle(lighterTop, 0.35);
      fillPoly([{ x: w/2, y: 0 }, { x: w, y: h/2 }, { x: w/2, y: h/2 }, { x: 0, y: h/2 }], true);
      // Grout lines (inner diamond, slightly smaller)
      g.lineStyle(1, lineColor, 0.5);
      strokePoly([
        { x: w/2, y: 2 }, { x: w-2, y: h/2 }, { x: w/2, y: h-2 }, { x: 2, y: h/2 },
      ], true);
      // Outer edge
      g.lineStyle(1, lineColor, 0.8);
      strokePoly([{ x: w/2, y: 0 }, { x: w, y: h/2 }, { x: w/2, y: h }, { x: 0, y: h/2 }], true);
      // Specular highlight (top-left corner glint)
      if (opts.sheen) {
        g.fillStyle(0xffffff, 0.08);
        fillPoly([{ x: w/2, y: 0 }, { x: w*0.65, y: h/4 }, { x: w/2, y: h/2 }, { x: w*0.35, y: h/4 }], true);
      }
      // Rubber mat dots
      if (opts.dots) {
        g.fillStyle(lineColor, 0.4);
        const spacing = 10;
        for (let dx = 10; dx < w - 10; dx += spacing) {
          for (let dy = 8; dy < h - 8; dy += 8) {
            // Only draw inside the diamond
            const tx = w/2 + (dx - w/2) * 0.5;
            const ty = dy;
            if (Math.abs(tx - w/2) / (w/2) + Math.abs(ty - h/2) / (h/2) < 0.85) {
              g.fillCircle(dx, dy, 1.2);
            }
          }
        }
      }
      // Wood planks
      if (opts.planks) {
        g.lineStyle(1, lineColor, 0.3);
        for (let i = 1; i < 3; i++) {
          const px = (w / 3) * i;
          g.lineBetween(px, h/2 - px * 0.25, px, h/2 + (w - px) * 0.25);
        }
      }
    };

    drawIsoTile(0x1e2340, 0x2d3566, { sheen: true });
    g.generateTexture("tile_floor", 64, 32);

    drawIsoTile(0x251e40, 0x3d2d6a, { sheen: true });
    g.generateTexture("tile_gym", 64, 32);

    drawIsoTile(0x201a0e, 0x3a2e1a, { planks: true });
    g.generateTexture("tile_home", 64, 32);

    drawIsoTile(0x0d2020, 0x00d4aa, { dots: true });
    g.generateTexture("tile_mat", 64, 32);

    drawIsoTile(0x1f0d20, 0xf72585, { sheen: true });
    g.generateTexture("tile_reception", 64, 32);

    // â”€â”€ ISO WALL TILE (64Ã—48) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    g.clear();
    // Top face
    g.fillStyle(0x1a1530, 1);
    fillPoly([{ x:32,y:0},{x:64,y:16},{x:32,y:32},{x:0,y:16}], true);
    // Top sheen
    g.fillStyle(0xffffff, 0.05);
    fillPoly([{ x:32,y:0},{x:64,y:16},{x:32,y:24},{x:0,y:16}], true);
    // Left face
    g.fillStyle(0x241e42, 1);
    fillPoly([{ x:0,y:16},{x:32,y:32},{x:32,y:48},{x:0,y:32}], true);
    // Right face (darker)
    g.fillStyle(0x13102e, 1);
    fillPoly([{ x:32,y:32},{x:64,y:16},{x:64,y:32},{x:32,y:48}], true);
    // Neon edge lines
    g.lineStyle(1, 0x6c47ff, 0.5);
    g.lineBetween(32, 0, 64, 16); g.lineBetween(32, 0, 0, 16);
    g.lineStyle(1, 0x3d2a7a, 0.4);
    g.lineBetween(0, 16, 0, 32); g.lineBetween(64, 16, 64, 32);
    g.lineBetween(0, 32, 32, 48); g.lineBetween(64, 32, 32, 48);
    // Baseboard glow
    g.fillStyle(0x6c47ff, 0.12);
    g.fillRect(0, 44, 64, 4);
    g.generateTexture("tile_wall", 64, 48);

    // â”€â”€ EQUIPMENT SPRITES (Premium Isometric) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const drawEquipmentBase = (topColor: number, sideColor: number, accent: number) => {
      const darkSide = Phaser.Display.Color.ValueToColor(sideColor).darken(25).color;
      // Drop shadow
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(32, 52, 44, 10);
      // Right face (darkest)
      g.fillStyle(darkSide, 1);
      fillPoly([{x:32,y:30},{x:58,y:17},{x:58,y:36},{x:32,y:49}], true);
      // Left face
      g.fillStyle(sideColor, 1);
      fillPoly([{x:6,y:17},{x:32,y:30},{x:32,y:49},{x:6,y:36}], true);
      // Top face
      g.fillStyle(topColor, 1);
      fillPoly([{x:32,y:4},{x:58,y:17},{x:32,y:30},{x:6,y:17}], true);
      // Top sheen
      const lighter = Phaser.Display.Color.ValueToColor(topColor).lighten(18).color;
      g.fillStyle(lighter, 0.4);
      fillPoly([{x:32,y:4},{x:50,y:13},{x:32,y:20},{x:14,y:13}], true);
      // Accent stripe on top
      g.lineStyle(2.5, accent, 1.0);
      g.lineBetween(18, 17, 46, 17);
      // Accent dot (LED indicator)
      g.fillStyle(accent, 1);
      g.fillCircle(52, 13, 2.5);
      // Edge outline
      g.lineStyle(1, accent, 0.35);
      strokePoly([{x:32,y:4},{x:58,y:17},{x:58,y:36},{x:32,y:49},{x:6,y:36},{x:6,y:17}], true);
    };

    // Bench Press â€” with bar + plates visual
    g.clear();
    drawEquipmentBase(0xc0282a, 0x7a1212, 0xff8080);
    // Bar
    g.lineStyle(3, 0x888888, 1);
    g.lineBetween(6, 17, 58, 17);
    g.fillStyle(0xaaaaaa, 1);
    g.fillCircle(9, 17, 5); g.fillCircle(55, 17, 5);
    g.fillStyle(0x555555, 1);
    g.fillCircle(9, 17, 3); g.fillCircle(55, 17, 3);
    g.generateTexture("eq_bench", 64, 58);

    // Treadmill â€” with belt + console
    g.clear();
    drawEquipmentBase(0x0a6a4e, 0x045038, 0x00ffcc);
    // Belt surface
    g.fillStyle(0x0d0d0d, 0.6);
    fillPoly([{x:14,y:17},{x:50,y:17},{x:50,y:29},{x:14,y:29}], false);
    // Console
    g.fillStyle(0x111111, 1);
    g.fillRoundedRect(24, 4, 16, 9, 2);
    g.fillStyle(0x00ffcc, 0.8);
    g.fillRect(26, 6, 12, 2);
    g.fillStyle(0x00ffcc, 0.4);
    g.fillRect(26, 9, 8, 1);
    g.generateTexture("eq_treadmill", 64, 58);

    // Squat Rack â€” with uprights
    g.clear();
    drawEquipmentBase(0x3d27a0, 0x251660, 0xb090ff);
    // Uprights (posts)
    g.fillStyle(0x888888, 1);
    g.fillRect(12, 6, 4, 24); g.fillRect(48, 6, 4, 24);
    g.fillStyle(0xaaaaaa, 0.6);
    g.fillRect(13, 6, 2, 24); g.fillRect(49, 6, 2, 24);
    // Horizontal bar
    g.fillStyle(0x999999, 1);
    g.fillRoundedRect(14, 12, 36, 3, 1);
    // Weight plates on bar
    g.fillStyle(0x222222, 1);
    g.fillRect(14, 10, 4, 7); g.fillRect(46, 10, 4, 7);
    g.generateTexture("eq_squat", 64, 58);

    // Cable Row Machine
    g.clear();
    drawEquipmentBase(0x0a5a7a, 0x043a55, 0x4cc9f0);
    // Cable lines
    g.lineStyle(1, 0x888888, 0.8);
    g.lineBetween(32, 8, 52, 20);
    g.lineBetween(32, 8, 12, 20);
    // Pulley wheel
    g.fillStyle(0xaaaaaa, 1);
    g.fillCircle(32, 8, 4);
    g.fillStyle(0x333333, 1);
    g.fillCircle(32, 8, 2);
    // Weight stack
    for (let i = 0; i < 3; i++) {
      g.fillStyle(i % 2 === 0 ? 0x334455 : 0x445566, 1);
      g.fillRect(8, 28 - i * 5, 10, 4);
    }
    g.generateTexture("eq_cable", 64, 58);

    // Spin Bike
    g.clear();
    drawEquipmentBase(0x9a6e08, 0x6a4a05, 0xfbbf24);
    // Wheel
    g.lineStyle(2, 0x888888, 1);
    g.strokeCircle(32, 20, 12);
    g.lineStyle(1, 0x666666, 0.8);
    for (let a = 0; a < 6; a++) {
      const angle = (a / 6) * Math.PI * 2;
      g.lineBetween(32, 20, 32 + Math.cos(angle) * 12, 20 + Math.sin(angle) * 12);
    }
    // Handlebars
    g.lineStyle(2, 0x888888, 1);
    g.lineBetween(22, 8, 42, 8);
    g.lineStyle(3, 0x666666, 1);
    g.lineBetween(32, 8, 32, 18);
    g.generateTexture("eq_bike", 64, 58);

    // Yoga Mat â€” flat, rolled
    g.clear();
    drawEquipmentBase(0x5a2070, 0x3a1250, 0xa78bfa);
    // Mat surface (flat gradient)
    g.fillStyle(0x7c3aed, 0.7);
    fillPoly([{x:10,y:17},{x:54,y:17},{x:54,y:28},{x:10,y:28}], false);
    // Mat rolled end
    g.fillStyle(0x8b5cf6, 1);
    g.fillEllipse(10, 22, 10, 14);
    g.fillStyle(0x6d28d9, 1);
    g.fillEllipse(54, 22, 10, 14);
    g.generateTexture("eq_yoga", 64, 58);

    // Pull-up Bar
    g.clear();
    drawEquipmentBase(0x076a3a, 0x044825, 0x34d399);
    // Vertical posts
    g.fillStyle(0xaaaaaa, 1);
    g.fillRect(10, 4, 5, 32); g.fillRect(49, 4, 5, 32);
    g.fillStyle(0xcccccc, 0.5);
    g.fillRect(11, 4, 2, 32); g.fillRect(50, 4, 2, 32);
    // Horizontal bar
    g.fillStyle(0x888888, 1);
    g.fillRoundedRect(12, 4, 40, 4, 2);
    g.fillStyle(0xcccccc, 0.4);
    g.fillRect(12, 4, 40, 2);
    // Grip rings
    g.fillStyle(0x333333, 1);
    g.fillRect(18, 3, 6, 6); g.fillRect(40, 3, 6, 6);
    g.generateTexture("eq_pullup", 64, 58);

    // â”€â”€ PREMIUM CHARACTER SPRITES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const drawCharacter = (
      skinColor: number,
      shirtColor: number,
      pantsColor: number,
      hairColor: number,
      opts: {
        hairStyle?: "spiky" | "curly" | "bun" | "short" | "none";
        muscleLevel?: number; // 0-3: thinâ†’buff
        expression?: "happy" | "focused" | "strained";
        isWorkout?: boolean;
        sweat?: boolean;
        bodyWidth?: number; // scale factor for body width
      } = {},
      w = 40, h = 60
    ) => {
      const cx = w / 2;
      const muscle = opts.muscleLevel ?? 1;
      const bodyW = (opts.bodyWidth ?? 1) * (12 + muscle * 2);
      const armW = 5 + muscle;

      g.clear();

      // Drop shadow
      g.fillStyle(0x000000, 0.22);
      g.fillEllipse(cx, h - 2, w * 0.65, 7);

      // Shoes
      g.fillStyle(0x111111, 1);
      g.fillRoundedRect(cx - bodyW - 1, h - 9, bodyW - 2, 6, 3);
      g.fillRoundedRect(cx + 3, h - 9, bodyW - 2, 6, 3);
      // Shoe highlights
      g.fillStyle(0xffffff, 0.12);
      g.fillRoundedRect(cx - bodyW, h - 9, 4, 3, 2);
      g.fillRoundedRect(cx + 4, h - 9, 4, 3, 2);

      // Pants
      g.fillStyle(pantsColor, 1);
      g.fillRoundedRect(cx - bodyW, h - 26, bodyW - 2, 18, 3);
      g.fillRoundedRect(cx + 2, h - 26, bodyW - 2, 18, 3);
      // Pants highlight
      g.fillStyle(0xffffff, 0.08);
      g.fillRect(cx - bodyW + 1, h - 26, 3, 16);

      // Shirt / torso
      const shirtTop = h - 46;
      g.fillStyle(shirtColor, 1);
      g.fillRoundedRect(cx - bodyW - muscle, shirtTop, bodyW * 2 + muscle * 2, 22, 5);
      // Shirt shading
      const darkerShirt = Phaser.Display.Color.ValueToColor(shirtColor).darken(15).color;
      g.fillStyle(darkerShirt, 0.4);
      g.fillRoundedRect(cx + 2, shirtTop + 2, bodyW - 2, 18, 3);
      // Shirt highlight
      g.fillStyle(0xffffff, 0.12);
      g.fillRoundedRect(cx - bodyW, shirtTop + 2, 4, 14, 2);

      // Arms
      g.fillStyle(skinColor, 1);
      g.fillRoundedRect(cx - bodyW - armW - muscle, shirtTop + 2, armW + muscle, 16, 3);
      g.fillRoundedRect(cx + bodyW + 1, shirtTop + 2, armW + muscle, 16, 3);
      // Arm muscle shadow
      if (muscle > 1) {
        g.fillStyle(0x000000, 0.12);
        g.fillEllipse(cx - bodyW - armW/2 - muscle/2, shirtTop + 8, armW, 8);
        g.fillEllipse(cx + bodyW + armW/2 + muscle/2 + 1, shirtTop + 8, armW, 8);
      }

      // Neck
      g.fillStyle(skinColor, 1);
      g.fillRoundedRect(cx - 4, shirtTop - 5, 8, 7, 2);

      // Head
      const headY = shirtTop - 14;
      g.fillStyle(skinColor, 1);
      g.fillCircle(cx, headY, 12);
      // Head shading
      g.fillStyle(0x000000, 0.08);
      g.fillCircle(cx + 3, headY + 3, 8);

      // Eyes
      const eyeExpr = opts.expression ?? "happy";
      g.fillStyle(0xffffff, 1);
      g.fillCircle(cx - 4, headY - 1, 3.5);
      g.fillCircle(cx + 4, headY - 1, 3.5);
      // Pupils
      const pupilOffset = eyeExpr === "focused" ? 1 : 0;
      g.fillStyle(0x1a1a2e, 1);
      g.fillCircle(cx - 3.5 + pupilOffset, headY - 1, 2);
      g.fillCircle(cx + 4.5 + pupilOffset, headY - 1, 2);
      // Eye shine
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(cx - 3, headY - 2, 0.8);
      g.fillCircle(cx + 5, headY - 2, 0.8);
      // Eyebrows
      const browY = headY - 5;
      const browAngle = eyeExpr === "strained" ? -1 : eyeExpr === "focused" ? -0.5 : 0.5;
      g.lineStyle(1.5, hairColor, 1);
      g.lineBetween(cx - 6, browY + browAngle, cx - 2, browY - browAngle);
      g.lineBetween(cx + 2, browY - browAngle, cx + 6, browY + browAngle);

      // Mouth
      g.lineStyle(1.5, 0x553322, 0.8);
      if (eyeExpr === "happy") {
        g.beginPath(); g.arc(cx, headY + 4, 4, 0.2, Math.PI - 0.2, false); g.strokePath();
      } else if (eyeExpr === "strained") {
        g.beginPath(); g.arc(cx, headY + 6, 3, Math.PI + 0.3, -0.3, false); g.strokePath();
      } else {
        g.lineBetween(cx - 3, headY + 4, cx + 3, headY + 4);
      }

      // Hair
      const hairStyle = opts.hairStyle ?? "short";
      g.fillStyle(hairColor, 1);
      if (hairStyle === "spiky") {
        for (let i = 0; i < 5; i++) {
          const sx = cx - 8 + i * 4;
          g.fillTriangle(sx, headY - 10, sx + 2, headY - 10, sx + 1, headY - 10 - 5 - (i % 2) * 3);
        }
        g.fillRect(cx - 10, headY - 12, 20, 6);
      } else if (hairStyle === "curly") {
        g.fillCircle(cx - 7, headY - 10, 5);
        g.fillCircle(cx, headY - 13, 6);
        g.fillCircle(cx + 7, headY - 10, 5);
        g.fillRect(cx - 12, headY - 12, 24, 5);
      } else if (hairStyle === "bun") {
        g.fillRect(cx - 10, headY - 12, 20, 5);
        g.fillCircle(cx, headY - 16, 5);
        // Bun highlight
        g.fillStyle(Phaser.Display.Color.ValueToColor(hairColor).lighten(20).color, 0.4);
        g.fillCircle(cx - 1, headY - 17, 2);
      } else if (hairStyle === "short") {
        g.fillRect(cx - 11, headY - 12, 22, 7);
        g.fillCircle(cx - 8, headY - 12, 5);
        g.fillCircle(cx + 8, headY - 12, 5);
      }

      // Sweat drops
      if (opts.sweat) {
        g.fillStyle(0x4cc9f0, 0.9);
        g.fillCircle(cx + 9, headY - 6, 2);
        g.fillCircle(cx - 10, headY - 2, 1.5);
        g.fillCircle(cx + 6, headY + 1, 1);
        // Sweat on shirt
        g.fillStyle(0x4cc9f0, 0.2);
        g.fillEllipse(cx, shirtTop + 10, 10, 6);
      }

      // Workout pose â€” raised arms
      if (opts.isWorkout) {
        g.fillStyle(skinColor, 1);
        g.fillRoundedRect(cx - bodyW - armW - muscle - 2, shirtTop - 10, armW + muscle, 14, 3);
        g.fillRoundedRect(cx + bodyW + 1, shirtTop - 10, armW + muscle, 14, 3);
      }
    };

    // â”€â”€ PLAYER CHARACTER VARIANTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Skinny (stage 0) â€” thin, enthusiastic
    drawCharacter(0xffd5a8, 0x4cc9f0, 0x334455, 0x3a2a1a,
      { hairStyle: "spiky", muscleLevel: 0, expression: "happy", bodyWidth: 0.8 });
    g.generateTexture("char_skinny", 40, 60);

    drawCharacter(0xffd5a8, 0x4cc9f0, 0x334455, 0x3a2a1a,
      { hairStyle: "spiky", muscleLevel: 0, expression: "strained", isWorkout: true, sweat: true, bodyWidth: 0.8 });
    g.generateTexture("char_skinny_workout", 40, 60);

    // Average (intermediate)
    drawCharacter(0xffb870, 0x6c47ff, 0x2d2d4e, 0x1a0a05,
      { hairStyle: "short", muscleLevel: 1, expression: "focused" });
    g.generateTexture("char_average", 40, 60);

    drawCharacter(0xffb870, 0x6c47ff, 0x2d2d4e, 0x1a0a05,
      { hairStyle: "short", muscleLevel: 1, expression: "strained", isWorkout: true, sweat: true });
    g.generateTexture("char_average_workout", 40, 60);

    // Overweight
    drawCharacter(0xffc080, 0xff6b35, 0x3d2020, 0x2a1a0a,
      { hairStyle: "short", muscleLevel: 0, expression: "happy", bodyWidth: 1.4 });
    g.generateTexture("char_overweight", 40, 60);

    drawCharacter(0xffc080, 0xff6b35, 0x3d2020, 0x2a1a0a,
      { hairStyle: "short", muscleLevel: 0, expression: "strained", isWorkout: true, sweat: true, bodyWidth: 1.4 });
    g.generateTexture("char_overweight_workout", 40, 60);

    // Transformed (stage 3-5) â€” buff versions
    drawCharacter(0xffb870, 0x6c47ff, 0x1a1a3e, 0x111111,
      { hairStyle: "short", muscleLevel: 3, expression: "focused" });
    g.generateTexture("char_buff", 40, 60);

    // NPC variants â€” diverse
    drawCharacter(0xffcba0, 0xf72585, 0x1a0e2e, 0x8b0000,
      { hairStyle: "bun", muscleLevel: 1, expression: "happy" });
    g.generateTexture("char_npc_f", 40, 60);

    drawCharacter(0xffd5a0, 0x00b4d8, 0x1e2a3e, 0x1a0a05,
      { hairStyle: "short", muscleLevel: 2, expression: "focused" });
    g.generateTexture("char_npc_m", 40, 60);

    drawCharacter(0xffb870, 0x00d4aa, 0x1a3020, 0x2a3020,
      { hairStyle: "curly", muscleLevel: 1, expression: "happy" });
    g.generateTexture("char_npc_g", 40, 60);

    drawCharacter(0xffc890, 0xf59e0b, 0x2e2010, 0x1a0a00,
      { hairStyle: "spiky", muscleLevel: 0, expression: "happy" });
    g.generateTexture("char_npc_y", 40, 60);

    // Generic NPC fallback
    drawCharacter(0xffd5a0, 0x555577, 0x333344, 0x222222,
      { hairStyle: "short", muscleLevel: 1, expression: "happy" });
    g.generateTexture("char_npc", 40, 60);

    // â”€â”€ PLAYER RING (pulsing aura) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    g.clear();
    // Outer glow ring
    g.fillStyle(0x6c47ff, 0.08).fillCircle(26, 26, 24);
    g.fillStyle(0x6c47ff, 0.12).fillCircle(26, 26, 20);
    // Inner ring
    g.lineStyle(2, 0x6c47ff, 0.9).strokeCircle(26, 26, 18);
    // Highlight arc
    g.lineStyle(3, 0xa78bfa, 0.6);
    g.beginPath(); g.arc(26, 26, 18, -1.0, 0.2, false); g.strokePath();
    g.generateTexture("player_ring", 52, 52);

    // â”€â”€ UI & PROP TEXTURES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Joystick base â€” glass look
    g.clear();
    g.fillStyle(0xffffff, 0.06).fillCircle(52, 52, 48);
    g.fillStyle(0x6c47ff, 0.08).fillCircle(52, 52, 36);
    g.lineStyle(2, 0xffffff, 0.2).strokeCircle(52, 52, 48);
    g.lineStyle(1, 0x6c47ff, 0.3).strokeCircle(52, 52, 36);
    g.generateTexture("joystick_base", 104, 104);

    // Joystick thumb â€” premium
    g.clear();
    g.fillStyle(0x4a2ecc, 1).fillCircle(24, 24, 22);
    g.fillStyle(0x6c47ff, 1).fillCircle(24, 24, 20);
    g.fillStyle(0x8b6fff, 0.6).fillEllipse(18, 18, 14, 10);
    g.lineStyle(2, 0xa78bfa, 0.9).strokeCircle(24, 24, 20);
    g.generateTexture("joystick_thumb", 48, 48);

    // Income coin
    g.clear();
    g.fillStyle(0xcc9900, 1).fillCircle(14, 14, 13);
    g.fillStyle(0xffd700, 1).fillCircle(14, 14, 11);
    g.fillStyle(0xffed4a, 0.8).fillEllipse(10, 10, 9, 7);
    g.lineStyle(2, 0xcc8800, 1).strokeCircle(14, 14, 11);
    // $ symbol hint
    g.lineStyle(1.5, 0xcc9900, 0.6);
    g.lineBetween(14, 7, 14, 21);
    g.generateTexture("income_indicator", 28, 28);

    // â”€â”€ GYM PROPS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // TV Screen
    g.clear();
    g.fillStyle(0x111111, 1).fillRoundedRect(0, 0, 48, 32, 4);
    g.fillStyle(0x000a20, 1).fillRect(3, 3, 42, 24);
    g.fillStyle(0x00d4aa, 0.2).fillRect(3, 3, 42, 24);
    // Screen content (stats bar)
    g.fillStyle(0x00d4aa, 0.9).fillRect(6, 8, 36 * 0.75, 3);
    g.fillStyle(0x6c47ff, 0.9).fillRect(6, 14, 36 * 0.5, 3);
    g.fillStyle(0xf59e0b, 0.9).fillRect(6, 20, 36 * 0.6, 3);
    // Screen glow
    g.fillStyle(0x00d4aa, 0.06).fillRect(3, 3, 42, 24);
    // Stand
    g.fillStyle(0x333333, 1).fillRect(20, 28, 8, 4);
    g.fillStyle(0x444444, 1).fillRect(16, 32, 16, 2);
    g.generateTexture("prop_tv", 48, 36);

    // Water Cooler
    g.clear();
    g.fillStyle(0x334466, 1).fillRoundedRect(4, 12, 20, 24, 3);
    g.fillStyle(0x4cc9f0, 0.7).fillRoundedRect(6, 2, 16, 14, 4);
    g.fillStyle(0xaaddff, 0.4).fillRoundedRect(7, 3, 8, 8, 3);
    g.fillStyle(0x00aaff, 1).fillCircle(14, 28, 2);
    g.fillStyle(0xff4444, 1).fillCircle(14, 33, 2);
    g.lineStyle(1, 0x557799, 0.6);
    g.strokeRoundedRect(4, 12, 20, 24, 3);
    g.generateTexture("prop_water", 28, 38);

    // Neon Sign texture
    g.clear();
    g.fillStyle(0x0d0d1a, 0.9).fillRoundedRect(0, 0, 120, 28, 6);
    g.lineStyle(2, 0x6c47ff, 0.8).strokeRoundedRect(0, 0, 120, 28, 6);
    // Glow layers
    g.lineStyle(6, 0x6c47ff, 0.1).strokeRoundedRect(2, 2, 116, 24, 5);
    g.lineStyle(3, 0x6c47ff, 0.25).strokeRoundedRect(2, 2, 116, 24, 5);
    g.generateTexture("prop_sign_bg", 120, 28);

    // Particle textures
    g.clear();
    g.fillStyle(0xffffff, 1).fillCircle(4, 4, 3);
    g.generateTexture("particle_dot", 8, 8);

    g.clear();
    g.fillStyle(0xffd700, 1).fillCircle(3, 3, 2.5);
    g.generateTexture("particle_coin", 6, 6);

    g.clear();
    g.fillStyle(0xa78bfa, 1).fillCircle(3, 3, 2);
    g.fillStyle(0xffffff, 0.5).fillCircle(2, 2, 1);
    g.generateTexture("particle_xp", 6, 6);

    g.clear();
    g.fillStyle(0x4cc9f0, 1).fillEllipse(3, 5, 4, 6);
    g.generateTexture("particle_sweat", 6, 10);

    g.clear();
    g.fillStyle(0xffffff, 0.6).fillCircle(2, 2, 2);
    g.generateTexture("particle_dust", 4, 4);

    // â”€â”€ PROGRESS BAR ATLAS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    g.clear();
    g.fillStyle(0x1a1a2e, 1).fillRoundedRect(0, 0, 56, 8, 4);
    g.generateTexture("bar_bg", 56, 8);

    g.clear();
    g.fillStyle(0x6c47ff, 1).fillRoundedRect(0, 0, 56, 8, 4);
    g.fillStyle(0xa78bfa, 0.4).fillRoundedRect(0, 0, 56, 4, 4);
    g.generateTexture("bar_fill_purple", 56, 8);

    g.clear();
    g.fillStyle(0x00d4aa, 1).fillRoundedRect(0, 0, 56, 8, 4);
    g.fillStyle(0x5fffdd, 0.4).fillRoundedRect(0, 0, 56, 4, 4);
    g.generateTexture("bar_fill_teal", 56, 8);

    g.destroy();
  }
}
