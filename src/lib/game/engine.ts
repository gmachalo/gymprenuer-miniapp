/**
 * Game Engine — Reward Calculation
 *
 * Controlled tokenomics:
 *   - Emission caps prevent infinite supply
 *   - Diminishing returns prevent farming
 *   - Sinks: gym fees, equipment purchases, challenge entry
 */

export interface WorkoutRewardInput {
  durationMins: number;
  intensity: "LOW" | "MEDIUM" | "HIGH";
  adherencePct: number;
  streakCount: number;
  fitnessBoost: number; // 0–0.30 from fitness API
  dailyWorkoutCount: number; // workouts done today already
}

export interface RewardResult {
  baseTokens: bigint;
  bonusTokens: bigint;
  totalTokens: bigint;
  fitnessBoostApplied: number;
  cappedByDailyLimit: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_TOKENS_PER_MIN = BigInt(1); // 1 GYMFIT per minute (off-chain)

const INTENSITY_MULTIPLIER: Record<string, number> = {
  LOW: 0.7,
  MEDIUM: 1.0,
  HIGH: 1.4,
};

const DAILY_TOKEN_CAP = BigInt(200); // max tokens earnable per day

export const MAX_XP_BAR = 100;

// ─── XP pool cap by transformation stage ─────────────────────────────────────
// XP is spendable energy, not a reward: workouts draw down the pool
// (currentXp + overflowXp), never add to it. Passive regen is the only source
// of XP, and how much a player can hold caps out higher the further along the
// transformation ladder they are — Beginner holds the least, Pro (Advanced)
// holds 500, and the pool keeps growing through Elite/Legend above that.
export const STAGE_MAX_XP = [200, 300, 400, 500, 600, 700];

export function maxXpForStage(stage: number): number {
  const idx = Math.min(Math.max(stage, 0), STAGE_MAX_XP.length - 1);
  return STAGE_MAX_XP[idx];
}

// ─── Leveling ──────────────────────────────────────────────────────────────
// Eligibility is stats-only — every one of strength/stamina/discipline/
// metabolism must independently clear a per-level floor — but leveling up
// still spends XP from the pool as the cost of the push itself, so it also
// requires having the energy on hand. At level 14 this tops out at exactly
// 700, the max pool size at Legend (the highest stage) — so it's never
// mathematically out of reach regardless of stage. Stats move either through
// in-game workouts or through a linked real-world fitness app (see
// src/lib/fitness), which is why the floor can afford to be this steep.

export const STAT_PER_LEVEL = 10;
export const XP_PER_LEVEL = 50;

/** Minimum value each of strength/stamina/discipline/metabolism must hit to advance from `level`. */
export function statRequiredForLevel(level: number): number {
  return level * STAT_PER_LEVEL;
}

// ─── Starting stats ──────────────────────────────────────────────────────────
// Characters start below the level-1 floor (STAT_PER_LEVEL) on purpose: the
// first level-up has to be earned by training, in-game or through a linked
// real-world workout app. The exact opening line-up is drawn from the choices
// made at signup — body type sets the shape, the goals (workout plans) picked
// tilt it, and where you train nudges it again — so two players who pick
// differently do not open on the same numbers.

export interface StatBlock {
  strength: number;
  stamina: number;
  discipline: number;
  metabolism: number;
}

/** Body type is the base shape — every value sits under the level-1 floor of 10. */
export const BODY_TYPE_BASE_STATS: Record<string, StatBlock> = {
  SKINNY:     { strength: 3, stamina: 6, discipline: 4, metabolism: 7 },
  AVERAGE:    { strength: 5, stamina: 5, discipline: 5, metabolism: 5 },
  OVERWEIGHT: { strength: 7, stamina: 3, discipline: 4, metabolism: 3 },
};

/** Each goal picked at signup tilts the opening block toward what that plan trains. */
export const PLAN_STAT_BIAS: Record<string, Partial<StatBlock>> = {
  STRENGTH:     { strength: 2, discipline: 1 },
  FAT_LOSS:     { metabolism: 2, stamina: 1 },
  HYBRID:       { strength: 1, stamina: 1, discipline: 1 },
  CALISTHENICS: { discipline: 2, stamina: 1 },
};

/** Where a solo player trains. Gym access favours load, home favours consistency. */
export const ENV_STAT_BIAS: Record<string, Partial<StatBlock>> = {
  GYM:  { strength: 1 },
  HOME: { discipline: 1 },
};

/** No pick may lift a stat more than this above its body-type base — picking every goal must not out-run picking one. */
export const MAX_SIGNUP_STAT_BONUS = 3;

const STAT_KEYS = ["strength", "stamina", "discipline", "metabolism"] as const;

/**
 * Opening stat block for a new character, derived from the signup selections.
 * Bonuses are capped per stat, and the whole block is clamped below the level-1
 * floor so nobody can pick their way to a free level.
 */
export function startingStatsFor(opts: {
  bodyType: string;
  planTypes?: string[];
  workoutEnv?: string | null;
}): StatBlock {
  const base = BODY_TYPE_BASE_STATS[opts.bodyType] ?? BODY_TYPE_BASE_STATS.AVERAGE;

  const biases: Partial<StatBlock>[] = [
    ...(opts.planTypes ?? []).map((t) => PLAN_STAT_BIAS[t] ?? {}),
    ...(opts.workoutEnv ? [ENV_STAT_BIAS[opts.workoutEnv] ?? {}] : []),
  ];

  const result = { ...base };
  for (const key of STAT_KEYS) {
    const bonus = biases.reduce((sum, b) => sum + (b[key] ?? 0), 0);
    result[key] = Math.min(
      base[key] + Math.min(bonus, MAX_SIGNUP_STAT_BONUS),
      STAT_PER_LEVEL - 1
    );
  }
  return result;
}

/** XP spent, from the pool, to advance from `level` to `level + 1`. */
export function xpRequiredForLevel(level: number): number {
  return level * XP_PER_LEVEL;
}

// ─── Gym Trainers ────────────────────────────────────────────────────────────
// Trainer pay is denominated in micro-GYMFIT (1 GYMFIT = MICRO_PER_GYMFIT
// micro-units) so tier-1's fractional 0.00001 GYMFIT rate can accumulate
// exactly as an integer instead of drifting as a float.

export const MICRO_PER_GYMFIT = 100_000n;

// Index 0 = tier 1 ... index 4 = tier 5. 10x scaling per tier, tier 1 = 0.00001 GYMFIT.
const TRAINER_PAY_MICRO_BY_TIER: bigint[] = [1n, 10n, 100n, 1000n, 10000n];

/** Micro-GYMFIT a trainer earns per player workout completed at a gym of this tier. */
export function trainerPayMicroForTier(tier: number): bigint {
  const idx = Math.min(Math.max(tier, 1), TRAINER_PAY_MICRO_BY_TIER.length) - 1;
  return TRAINER_PAY_MICRO_BY_TIER[idx];
}

// Trainers need to have reached "Pro" (the Advanced transformation stage)
// regardless of gym tier, on top of a level requirement that is the stricter
// of a flat floor and the gym tier's own scaling — and spend a one-time XP
// cost (scaled by tier) to actually activate trainer mode once eligible.
export const TRAINER_MIN_LEVEL = 5;
export const PRO_STAGE = 3; // STAGE_LABELS[3] === "Advanced"
export const STAGE_LABELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite", "Legend"];

/** Player level required to become a trainer at a gym of this tier — the stricter of a flat floor and the tier's own scaling. */
export function trainerLevelRequirement(tier: number): number {
  return Math.max(TRAINER_MIN_LEVEL, Math.min(Math.max(tier, 1), 5) * 2);
}

/** One-time XP cost to activate trainer mode at a gym of this tier. */
export function trainerActivationXpCost(tier: number): number {
  return Math.min(Math.max(tier, 1), 5) * 50;
}

// ─── Gym Equipment ───────────────────────────────────────────────────────────
// Equipment is graded 1–6. Grade 1 is what anyone can train on at home; a gym
// unlocks one grade above that for its own tier, so a tier-1 gym is exactly one
// grade better than working out at home, and every tier above opens the next
// grade of gear. Owners spend GYMFIT to buy new pieces and to upgrade the ones
// they have, and it is that build-out which qualifies a gym for its own next
// tier (see gymTierRequirement).

/** The grade of equipment available at home — the baseline every player has. */
export const HOME_EQUIPMENT_GRADE = 1;
export const MAX_EQUIPMENT_GRADE = 6;
export const MAX_EQUIPMENT_LEVEL = 5;

/** Highest equipment grade a gym of this tier may host. Tier 1 sits one grade above home. */
export function equipmentGradeForGymTier(tier: number): number {
  return Math.min(Math.max(tier, 1), 5) + HOME_EQUIPMENT_GRADE;
}

export interface EquipmentSpec {
  /** Catalog key — stored as Equipment.type and used as the in-scene id. */
  type: string;
  name: string;
  /** 1 = home, 2–6 = unlocked by gym tiers 1–5. */
  grade: number;
  /** Sprite key registered in BootScene. */
  tex: string;
  /** Emoji used wherever the piece is shown outside the Phaser canvas. */
  icon: string;
  xpCost: number;
  /** GYMFIT paid out per workout at level 1, before the level multiplier. */
  baseTokens: number;
  intensity: "LOW" | "MEDIUM" | "HIGH";
  /** Which plan type this trains — drives the stat gain a workout on it awards. */
  planType: string;
  /** GYMFIT an owner pays to add this to their gym. */
  purchaseCost: number;
  capacity: number;
}

export const EQUIPMENT_CATALOG: EquipmentSpec[] = [
  // ── Grade 1 — home ─────────────────────────────────────────────────────────
  { type: "yoga",      name: "Yoga Mat", icon: "🧘",         grade: 1, tex: "eq_yoga",      xpCost: 5,  baseTokens: 3,  intensity: "LOW",    planType: "CALISTHENICS", purchaseCost: 0,     capacity: 1 },
  { type: "pushups",   name: "Push-up Station", icon: "💪",  grade: 1, tex: "eq_cable",     xpCost: 5,  baseTokens: 3,  intensity: "MEDIUM", planType: "CALISTHENICS", purchaseCost: 0,     capacity: 1 },
  { type: "pullup",    name: "Pull-up Bar", icon: "🤸",      grade: 1, tex: "eq_pullup",    xpCost: 8,  baseTokens: 5,  intensity: "HIGH",   planType: "CALISTHENICS", purchaseCost: 0,     capacity: 1 },

  // ── Grade 2 — tier 1 gym: the basics, one clear step up from home ──────────
  { type: "bench",     name: "Bench Press", icon: "🏋️",      grade: 2, tex: "eq_bench",     xpCost: 10, baseTokens: 8,  intensity: "HIGH",   planType: "STRENGTH",     purchaseCost: 400,   capacity: 3 },
  { type: "treadmill", name: "Treadmill", icon: "🏃",        grade: 2, tex: "eq_treadmill", xpCost: 8,  baseTokens: 6,  intensity: "MEDIUM", planType: "FAT_LOSS",     purchaseCost: 350,   capacity: 4 },
  { type: "bike",      name: "Spin Bike", icon: "🚴",        grade: 2, tex: "eq_bike",      xpCost: 6,  baseTokens: 5,  intensity: "LOW",    planType: "FAT_LOSS",     purchaseCost: 300,   capacity: 4 },
  { type: "cable",     name: "Cable Row", icon: "🎣",        grade: 2, tex: "eq_cable",     xpCost: 8,  baseTokens: 7,  intensity: "MEDIUM", planType: "HYBRID",       purchaseCost: 450,   capacity: 3 },

  // ── Grade 3 — tier 2 gym ───────────────────────────────────────────────────
  { type: "squat",     name: "Squat Rack", icon: "🦵",       grade: 3, tex: "eq_squat",     xpCost: 12, baseTokens: 12, intensity: "HIGH",   planType: "STRENGTH",     purchaseCost: 1200,  capacity: 2 },
  { type: "latpull",   name: "Lat Pulldown", icon: "🧗",     grade: 3, tex: "eq_cable",     xpCost: 9,  baseTokens: 10, intensity: "MEDIUM", planType: "STRENGTH",     purchaseCost: 1000,  capacity: 3 },
  { type: "rower",     name: "Rowing Erg", icon: "🚣",       grade: 3, tex: "eq_bike",      xpCost: 10, baseTokens: 11, intensity: "HIGH",   planType: "HYBRID",       purchaseCost: 1100,  capacity: 3 },

  // ── Grade 4 — tier 3 gym ───────────────────────────────────────────────────
  { type: "smith",     name: "Smith Machine", icon: "⚙️",    grade: 4, tex: "eq_squat",     xpCost: 14, baseTokens: 18, intensity: "HIGH",   planType: "STRENGTH",     purchaseCost: 3000,  capacity: 2 },
  { type: "legpress",  name: "Leg Press", icon: "🦿",        grade: 4, tex: "eq_bench",     xpCost: 13, baseTokens: 16, intensity: "HIGH",   planType: "STRENGTH",     purchaseCost: 2800,  capacity: 2 },
  { type: "assault",   name: "Assault Bike", icon: "🌪️",     grade: 4, tex: "eq_bike",      xpCost: 11, baseTokens: 15, intensity: "HIGH",   planType: "FAT_LOSS",     purchaseCost: 2500,  capacity: 3 },

  // ── Grade 5 — tier 4 gym ───────────────────────────────────────────────────
  { type: "powerrack", name: "Power Rack", icon: "🏗️",       grade: 5, tex: "eq_squat",     xpCost: 16, baseTokens: 26, intensity: "HIGH",   planType: "STRENGTH",     purchaseCost: 7000,  capacity: 2 },
  { type: "crossover", name: "Cable Crossover", icon: "✖️",  grade: 5, tex: "eq_cable",     xpCost: 12, baseTokens: 22, intensity: "MEDIUM", planType: "HYBRID",       purchaseCost: 6000,  capacity: 3 },
  { type: "skierg",    name: "Ski Erg", icon: "⛷️",          grade: 5, tex: "eq_treadmill", xpCost: 12, baseTokens: 21, intensity: "HIGH",   planType: "FAT_LOSS",     purchaseCost: 5500,  capacity: 3 },

  // ── Grade 6 — tier 5 gym: competition kit ──────────────────────────────────
  { type: "platform",  name: "Comp Platform", icon: "🏆",    grade: 6, tex: "eq_bench",     xpCost: 18, baseTokens: 38, intensity: "HIGH",   planType: "STRENGTH",     purchaseCost: 16000, capacity: 2 },
  { type: "curved",    name: "Curved Treadmill", icon: "🌀", grade: 6, tex: "eq_treadmill", xpCost: 14, baseTokens: 32, intensity: "HIGH",   planType: "FAT_LOSS",     purchaseCost: 14000, capacity: 3 },
  { type: "rig",       name: "Pneumatic Rig", icon: "🦾",    grade: 6, tex: "eq_pullup",    xpCost: 15, baseTokens: 34, intensity: "HIGH",   planType: "HYBRID",       purchaseCost: 15000, capacity: 4 },
];

export function equipmentSpec(type: string): EquipmentSpec | null {
  return EQUIPMENT_CATALOG.find((e) => e.type === type) ?? null;
}

/** Everything a gym of this tier is allowed to host. */
export function equipmentAvailableForTier(tier: number): EquipmentSpec[] {
  const maxGrade = equipmentGradeForGymTier(tier);
  return EQUIPMENT_CATALOG.filter((e) => e.grade > HOME_EQUIPMENT_GRADE && e.grade <= maxGrade);
}

/** What a player can train on at home — the grade every gym is measured against. */
export function homeEquipment(): EquipmentSpec[] {
  return EQUIPMENT_CATALOG.filter((e) => e.grade === HOME_EQUIPMENT_GRADE);
}

// Load-bearing work at the back, cardio toward the front: the order a floor is
// laid out in, so the game world and the dashboard tiles read the same way.
const FLOOR_ZONE_ORDER: Record<string, number> = {
  STRENGTH: 0,
  HYBRID: 1,
  CALISTHENICS: 2,
  FAT_LOSS: 3,
};

/** Sort pieces into floor order (stable within a zone, so purchase order breaks ties). */
export function floorOrder<T extends { type: string }>(pieces: T[]): T[] {
  const zone = (p: T) => FLOOR_ZONE_ORDER[equipmentSpec(p.type)?.planType ?? "HYBRID"] ?? 1;
  return pieces
    .map((piece, index) => ({ piece, index }))
    .sort((a, b) => zone(a.piece) - zone(b.piece) || a.index - b.index)
    .map(({ piece }) => piece);
}

/** Accent colour for an equipment grade — home grey up to championship gold. */
export const GRADE_COLORS: Record<number, number> = {
  1: 0x8d99ae,
  2: 0x4cc9f0,
  3: 0x00d4aa,
  4: 0xa78bfa,
  5: 0xf72585,
  6: 0xffd700,
};

/** GYMFIT paid out per workout — each upgrade level adds 25% of the base rate. */
export function equipmentTokenYield(spec: EquipmentSpec, level: number): number {
  const lvl = Math.min(Math.max(level, 1), MAX_EQUIPMENT_LEVEL);
  return Math.round(spec.baseTokens * (1 + 0.25 * (lvl - 1)));
}

/** GYMFIT to take a piece from `level` to `level + 1`. Null once it is maxed. */
export function equipmentUpgradeCost(spec: EquipmentSpec, level: number): bigint | null {
  if (level >= MAX_EQUIPMENT_LEVEL) return null;
  // Each level costs 60% of the purchase price, scaled by the level reached.
  return BigInt(Math.round(spec.purchaseCost * 0.6 * level));
}

// ─── Gym tier progression ────────────────────────────────────────────────────
// A gym earns its next tier by being built out, not merely paid for: the owner
// has to have bought enough equipment, levelled it up, and put at least one
// piece of the tier's own top grade on the floor — and then pay the GYMFIT.

export interface GymTierRequirement {
  /** The tier being unlocked. */
  tier: number;
  minEquipmentCount: number;
  /** Sum of every piece's level — rewards upgrading as well as buying. */
  minTotalEquipmentLevels: number;
  /** At least one piece at this grade, proving real investment in the current tier. */
  requiredTopGrade: number;
  costGymfit: bigint;
}

const GYM_TIER_REQUIREMENTS: GymTierRequirement[] = [
  { tier: 2, minEquipmentCount: 3, minTotalEquipmentLevels: 6,  requiredTopGrade: 2, costGymfit: 2000n },
  { tier: 3, minEquipmentCount: 5, minTotalEquipmentLevels: 12, requiredTopGrade: 3, costGymfit: 6000n },
  { tier: 4, minEquipmentCount: 7, minTotalEquipmentLevels: 20, requiredTopGrade: 4, costGymfit: 15000n },
  { tier: 5, minEquipmentCount: 9, minTotalEquipmentLevels: 30, requiredTopGrade: 5, costGymfit: 40000n },
];

/** What it takes to move a gym from `tier` to `tier + 1`; null at max tier. */
export function gymTierRequirement(tier: number): GymTierRequirement | null {
  return GYM_TIER_REQUIREMENTS.find((r) => r.tier === tier + 1) ?? null;
}

export interface EquipmentSummary {
  type: string;
  level: number;
}

export interface GymTierProgress {
  requirement: GymTierRequirement | null;
  equipmentCount: number;
  totalEquipmentLevels: number;
  hasTopGrade: boolean;
  /** What is still missing; empty means the build-out is done. */
  missing: string[];
  /** True when the equipment side is satisfied — the GYMFIT is checked separately. */
  eligible: boolean;
}

/** How close a gym is to qualifying for its next tier. */
export function gymTierProgress(tier: number, equipment: EquipmentSummary[]): GymTierProgress {
  const requirement = gymTierRequirement(tier);
  const equipmentCount = equipment.length;
  const totalEquipmentLevels = equipment.reduce((sum, e) => sum + e.level, 0);

  if (!requirement) {
    return {
      requirement: null,
      equipmentCount,
      totalEquipmentLevels,
      hasTopGrade: true,
      missing: [],
      eligible: false,
    };
  }

  const hasTopGrade = equipment.some(
    (e) => (equipmentSpec(e.type)?.grade ?? 0) >= requirement.requiredTopGrade
  );

  const missing: string[] = [];
  if (equipmentCount < requirement.minEquipmentCount)
    missing.push(`${requirement.minEquipmentCount - equipmentCount} more equipment piece(s)`);
  if (totalEquipmentLevels < requirement.minTotalEquipmentLevels)
    missing.push(`${requirement.minTotalEquipmentLevels - totalEquipmentLevels} more equipment level(s)`);
  if (!hasTopGrade) missing.push(`at least one grade ${requirement.requiredTopGrade} machine`);

  return {
    requirement,
    equipmentCount,
    totalEquipmentLevels,
    hasTopGrade,
    missing,
    eligible: missing.length === 0,
  };
}

/** Minimum player level to join a gym of this tier — better gear is gated on progress. */
export function gymJoinLevelRequirement(tier: number): number {
  return Math.max(1, (Math.min(Math.max(tier, 1), 5) - 1) * 3);
}

// ─── Gym Amenities ───────────────────────────────────────────────────────────
// The other half of a gym floor. Equipment spends XP to earn GYMFIT; amenities
// do the reverse — they hand a little XP back, on a cooldown, the way the home
// recovery props do. Every gym has a water dispenser and a shower as standard
// fittings from tier 1. Everything else is bought by the owner with GYMFIT, and
// the higher the tier the more of it a gym can host: better refreshments first,
// then lockers, then whole rooms — a yoga studio, a sauna, a pool.

export type AmenityKind = "REFRESHMENT" | "HYGIENE" | "STORAGE" | "ROOM";

export interface AmenitySpec {
  /** Catalog key — stored as GymAmenity.type and used as the in-scene id. */
  type: string;
  name: string;
  kind: AmenityKind;
  icon: string;
  /** Sprite key registered in BootScene. */
  tex: string;
  /** Prompt verb shown in the game world. */
  verb: string;
  /** Minimum gym tier that may host it. */
  minTier: number;
  /** XP returned to the pool on use. 0 means it is a facility, not an interaction. */
  xpGain: number;
  cooldownMs: number;
  /** GYMFIT the owner pays. Standard fittings cost nothing and are always present. */
  installCost: number;
  /** Standard fittings come with the building and do not use an amenity slot. */
  standard: boolean;
  /** Reputation the gym gains once it is installed. */
  reputation: number;
  accentColor: number;
  blurb: string;
}

export const AMENITY_CATALOG: AmenitySpec[] = [
  // ── Standard fittings — in every gym, from tier 1 ─────────────────────────
  {
    type: "dispenser", name: "Water Dispenser", kind: "REFRESHMENT", icon: "🚰",
    tex: "prop_water", verb: "Drink", minTier: 1, xpGain: 2, cooldownMs: 5 * 60_000,
    installCost: 0, standard: true, reputation: 0, accentColor: 0x4cc9f0,
    blurb: "Cold water, free to all members. Every gym has one.",
  },
  {
    type: "shower", name: "Shower Area", kind: "HYGIENE", icon: "🚿",
    tex: "prop_shower", verb: "Shower", minTier: 1, xpGain: 1, cooldownMs: 10 * 60_000,
    installCost: 0, standard: true, reputation: 0, accentColor: 0x8ecae6,
    blurb: "Rinse off after a session. Standard from tier 1.",
  },

  // ── Refreshments — better drinks return more XP ───────────────────────────
  {
    type: "isotonic", name: "Isotonic Cooler", kind: "REFRESHMENT", icon: "🥤",
    tex: "prop_fridge", verb: "Drink", minTier: 2, xpGain: 4, cooldownMs: 8 * 60_000,
    installCost: 800, standard: false, reputation: 4, accentColor: 0x00d4aa,
    blurb: "Electrolyte drinks on tap. Recovers more than plain water.",
  },
  {
    type: "protein", name: "Protein Shake Bar", kind: "REFRESHMENT", icon: "🥛",
    tex: "prop_fridge", verb: "Refuel", minTier: 3, xpGain: 7, cooldownMs: 12 * 60_000,
    installCost: 2500, standard: false, reputation: 8, accentColor: 0xf4a261,
    blurb: "Shakes mixed on request — a proper refuel between sets.",
  },
  {
    type: "smoothie", name: "Smoothie Station", kind: "REFRESHMENT", icon: "🍓",
    tex: "prop_fridge", verb: "Refuel", minTier: 4, xpGain: 10, cooldownMs: 15 * 60_000,
    installCost: 6000, standard: false, reputation: 12, accentColor: 0xf72585,
    blurb: "Fruit, greens and a blender. Members linger, and spend.",
  },
  {
    type: "juicebar", name: "Juice Bar", kind: "REFRESHMENT", icon: "🧃",
    tex: "prop_fridge", verb: "Refuel", minTier: 5, xpGain: 14, cooldownMs: 20 * 60_000,
    installCost: 12000, standard: false, reputation: 18, accentColor: 0xffd700,
    blurb: "A staffed bar. The best recovery a gym floor can offer.",
  },

  // ── Facilities ────────────────────────────────────────────────────────────
  {
    type: "lockers", name: "Locker Room", kind: "STORAGE", icon: "🔐",
    tex: "prop_locker", verb: "Stash", minTier: 2, xpGain: 0, cooldownMs: 0,
    installCost: 1200, standard: false, reputation: 10, accentColor: 0x8d99ae,
    blurb: "Somewhere to leave your kit. No XP — it earns its keep in reputation, which drives gym income.",
  },

  // ── Rooms — dedicated spaces for a different kind of training ─────────────
  {
    type: "yogaroom", name: "Yoga Studio", kind: "ROOM", icon: "🧘",
    tex: "prop_yoga_room", verb: "Stretch", minTier: 3, xpGain: 8, cooldownMs: 20 * 60_000,
    installCost: 5000, standard: false, reputation: 15, accentColor: 0xa78bfa,
    blurb: "A quiet room away from the weights. Mobility work between sessions.",
  },
  {
    type: "sauna", name: "Sauna", kind: "ROOM", icon: "🧖",
    tex: "prop_sauna", verb: "Sweat", minTier: 4, xpGain: 15, cooldownMs: 30 * 60_000,
    installCost: 9000, standard: false, reputation: 22, accentColor: 0xff6b35,
    blurb: "Heat recovery. The single best XP return on the floor, on a long cooldown.",
  },
  {
    type: "pool", name: "Pool Area", kind: "ROOM", icon: "🏊",
    tex: "prop_pool", verb: "Swim", minTier: 5, xpGain: 20, cooldownMs: 30 * 60_000,
    installCost: 20000, standard: false, reputation: 30, accentColor: 0x00b4d8,
    blurb: "A full pool. The mark of a champion-tier gym.",
  },
];

export function amenitySpec(type: string): AmenitySpec | null {
  return AMENITY_CATALOG.find((a) => a.type === type) ?? null;
}

/** The fittings every gym has without buying them. */
export function standardAmenities(): AmenitySpec[] {
  return AMENITY_CATALOG.filter((a) => a.standard);
}

/** Everything a gym of this tier could buy, whether or not it already has it. */
export function amenitiesAvailableForTier(tier: number): AmenitySpec[] {
  return AMENITY_CATALOG.filter((a) => !a.standard && a.minTier <= tier);
}

// How many bought amenities a gym can hold. Tier 1 runs on its standard
// fittings alone; every tier above that adds room for more. The ceiling is 7,
// against 8 buyable amenities, so even a champion-tier gym has to choose — and
// 7 plus the two standard fittings is exactly what the gym floor has space to
// lay out (see AMENITY_SLOTS in GymScene).
const AMENITY_SLOTS_BY_TIER = [0, 2, 4, 6, 7];

/** Bought-amenity capacity at this tier — standard fittings do not count against it. */
export function amenitySlotsForTier(tier: number): number {
  return AMENITY_SLOTS_BY_TIER[Math.min(Math.max(tier, 1), 5) - 1];
}

export interface InstalledAmenity {
  type: string;
}

export interface AmenityCapacity {
  used: number;
  total: number;
  free: number;
}

export function amenityCapacity(tier: number, installed: InstalledAmenity[]): AmenityCapacity {
  const total = amenitySlotsForTier(tier);
  // Only bought amenities occupy a slot; a stale row for a standard fitting does not.
  const used = installed.filter((a) => !amenitySpec(a.type)?.standard).length;
  return { used, total, free: Math.max(0, total - used) };
}

/**
 * Why a gym cannot install this amenity right now, or null when it can.
 * Affordability is checked separately, against the owner's balance.
 */
export function amenityInstallBlocker(
  spec: AmenitySpec,
  tier: number,
  installed: InstalledAmenity[]
): string | null {
  if (spec.standard) return `${spec.name} is a standard fitting — every gym already has one.`;
  if (spec.minTier > tier)
    return `${spec.name} needs a tier ${spec.minTier} gym; this one is tier ${tier}.`;
  if (installed.some((a) => a.type === spec.type)) return `${spec.name} is already installed.`;
  const capacity = amenityCapacity(tier, installed);
  if (capacity.free <= 0)
    return `No amenity space left: a tier ${tier} gym holds ${capacity.total}. Upgrade the gym for more room.`;
  return null;
}

/** Apply passively-regenerated XP to the spendable pool (currentXp + overflowXp), capped by the player's current stage. */
export function applyXpReward(
  currentXp: number,
  overflowXp: number,
  xpToAdd: number,
  stage: number
): { currentXp: number; overflowXp: number; xpAdded: number } {
  const pool = currentXp + overflowXp;
  const room = Math.max(0, maxXpForStage(stage) - pool);
  const xpAdded = Math.min(xpToAdd, room);

  if (xpAdded <= 0) {
    return { currentXp, overflowXp, xpAdded: 0 };
  }

  const canAddToBar = Math.max(0, MAX_XP_BAR - currentXp);
  const addToBar = Math.min(xpAdded, canAddToBar);

  return {
    currentXp: Math.min(MAX_XP_BAR, currentXp + addToBar),
    overflowXp: overflowXp + (xpAdded - addToBar),
    xpAdded,
  };
}

/** Spend XP from the pool (overflow first, then current), clamped at 0. */
export function spendXp(
  currentXp: number,
  overflowXp: number,
  xpToSpend: number
): { currentXp: number; overflowXp: number } {
  let newOverflow = overflowXp;
  let newCurrent = currentXp;
  if (newOverflow >= xpToSpend) {
    newOverflow -= xpToSpend;
  } else {
    const remainder = xpToSpend - newOverflow;
    newOverflow = 0;
    newCurrent = Math.max(0, newCurrent - remainder);
  }
  return { currentXp: newCurrent, overflowXp: newOverflow };
}

// ─── Home Recovery Props ─────────────────────────────────────────────────────
// Bed/chair/fridge in HomeScene are the inverse of workout equipment: instead
// of spending XP, interacting with them ADDS XP back to the pool (still
// capped by maxXpForStage via applyXpReward). Each is on its own cooldown so
// they can't replace the intended rest-to-regen pacing with instant spam.
export const HOME_RECOVERY_ITEMS = {
  bed:    { xpGain: 30, cooldownMs: 20 * 60_000, label: "Bed",    verb: "Sleep" },
  chair:  { xpGain: 10, cooldownMs: 5  * 60_000, label: "Chair",  verb: "Relax" },
  fridge: { xpGain: 15, cooldownMs: 10 * 60_000, label: "Fridge", verb: "Eat" },
} as const;

export type HomeRecoveryItemId = keyof typeof HOME_RECOVERY_ITEMS;

// Diminishing returns: each successive workout today earns less
const DIMINISHING_RETURNS = [1.0, 0.6, 0.3, 0.1];

export function calculateWorkoutReward(input: WorkoutRewardInput): RewardResult {
  const {
    durationMins,
    intensity,
    adherencePct,
    streakCount,
    fitnessBoost,
    dailyWorkoutCount,
  } = input;

  const intensityMult = INTENSITY_MULTIPLIER[intensity] ?? 1.0;
  const adherenceMult = Math.max(0.1, adherencePct / 100);
  const streakBonus = Math.min(1 + streakCount * 0.02, 1.5); // max 50% streak bonus
  const diminish = DIMINISHING_RETURNS[Math.min(dailyWorkoutCount, 3)];

  // Base calculations — XP is no longer earned from workouts, only spent
  // (see calculateWorkoutXpCost); this only computes the GYMFIT reward.
  const rawTokens = BigInt(
    Math.floor(
      Number(BigInt(durationMins) * BASE_TOKENS_PER_MIN) *
        intensityMult *
        adherenceMult *
        streakBonus *
        diminish
    )
  );

  // Apply fitness boost: Total Reward = Base × (1 + FitnessBoost)
  const cappedBoost = Math.min(fitnessBoost, 0.3);
  const boostedTokens = BigInt(Math.floor(Number(rawTokens) * (1 + cappedBoost)));
  const bonusTokens = boostedTokens - rawTokens;

  // Apply daily cap
  const cappedByDailyLimit = boostedTokens > DAILY_TOKEN_CAP;
  const totalTokens = cappedByDailyLimit ? DAILY_TOKEN_CAP : boostedTokens;

  return {
    baseTokens: rawTokens,
    bonusTokens,
    totalTokens,
    fitnessBoostApplied: cappedBoost,
    cappedByDailyLimit,
  };
}

// ─── Workout XP Cost ──────────────────────────────────────────────────────────

/**
 * Calculate XP cost for a workout.
 * Base: 1 XP per 5 minutes, scaled by intensity.
 * Minimum cost: 3 XP.
 */
export function calculateWorkoutXpCost(
  durationMins: number,
  intensity: "LOW" | "MEDIUM" | "HIGH" | string
): number {
  const intensityMult: Record<string, number> = {
    LOW: 0.6,
    MEDIUM: 1.0,
    HIGH: 1.5,
  };
  const mult = intensityMult[intensity] ?? 1.0;
  return Math.max(3, Math.floor((durationMins / 5) * mult));
}

/** Each level above 1 adds this percentage of a workout's base XP cost. */
export const WORKOUT_XP_PCT_PER_LEVEL = 15;

/**
 * What a workout actually costs a player of this level. Training gets more
 * expensive as you level up — a Bench Press is 10 XP at level 1, 15 at level 4,
 * 24 at level 10 — so the regenerating XP pool stays the limiting factor all
 * the way up. Every place that charges or shows a workout's cost goes through
 * here: the workout routes, the game world's machine prompts and the dashboard
 * tiles.
 */
export function workoutXpCost(baseXpCost: number, level: number): number {
  const lvl = Math.max(1, Math.floor(level || 1));
  // Integer percentages: 0.15 × 9 is 1.3499… in floating point, which rounded
  // a level-10 Bench Press's 23.5 down to 23 instead of up to 24.
  const scaled = Math.round((baseXpCost * (100 + WORKOUT_XP_PCT_PER_LEVEL * (lvl - 1))) / 100);
  // On cheap kit 15% is under a point, so rounding alone could repeat a cost
  // (a Yoga Mat was 7 at both levels 3 and 4); every level adds at least 1 XP.
  return Math.max(scaled, baseXpCost + (lvl - 1));
}

// ─── Character Stat Progression ───────────────────────────────────────────────

export interface StatGain {
  strength: number;
  stamina: number;
  discipline: number;
  metabolism: number;
}

export function calculateStatGain(
  planType: string,
  durationMins: number,
  intensity: string,
  fitnessBoost = 0 // 0–0.30 from synced fitness data — amplifies the gains below
): StatGain {
  const base = Math.floor(durationMins / 20); // 1 point per 20 mins
  const intMult = { LOW: 0.5, MEDIUM: 1, HIGH: 1.5 }[intensity] ?? 1;

  const gains: Record<string, StatGain> = {
    STRENGTH: {
      strength: Math.ceil(base * 2 * intMult),
      stamina: Math.ceil(base * 0.5 * intMult),
      discipline: Math.ceil(base * 0.5 * intMult),
      metabolism: 0,
    },
    FAT_LOSS: {
      strength: Math.ceil(base * 0.5 * intMult),
      stamina: Math.ceil(base * 1.5 * intMult),
      discipline: Math.ceil(base * 0.5 * intMult),
      metabolism: Math.ceil(base * 1.5 * intMult),
    },
    HYBRID: {
      strength: Math.ceil(base * 1 * intMult),
      stamina: Math.ceil(base * 1 * intMult),
      discipline: Math.ceil(base * 1 * intMult),
      metabolism: Math.ceil(base * 0.5 * intMult),
    },
    CALISTHENICS: {
      strength: Math.ceil(base * 1 * intMult),
      stamina: Math.ceil(base * 1.5 * intMult),
      discipline: Math.ceil(base * 1.5 * intMult),
      metabolism: Math.ceil(base * 0.5 * intMult),
    },
  };

  const baseGain = gains[planType] ?? gains["HYBRID"];
  const boostMult = 1 + Math.min(Math.max(fitnessBoost, 0), 0.3);
  return {
    strength: Math.ceil(baseGain.strength * boostMult),
    stamina: Math.ceil(baseGain.stamina * boostMult),
    discipline: Math.ceil(baseGain.discipline * boostMult),
    metabolism: Math.ceil(baseGain.metabolism * boostMult),
  };
}

// ─── Transformation Stage ─────────────────────────────────────────────────────
// Driven by level (stats-gated), not lifetime XP — workouts no longer earn XP,
// so level is the only progression axis left to hang the stage ladder on.
// Reaching each threshold lines up with the matching gym tier's trainer level
// requirement (tier N needs level max(5, N×2)), so hitting a stage and
// unlocking training at the equivalent-tier gym tend to land together.
const LEVEL_FOR_STAGE = [1, 2, 4, 6, 8, 10]; // Beginner..Legend

export function calculateTransformationStage(level: number): number {
  for (let stage = LEVEL_FOR_STAGE.length - 1; stage >= 0; stage--) {
    if (level >= LEVEL_FOR_STAGE[stage]) return stage;
  }
  return 0;
}

// ─── Gym Income (NPC simulation) ─────────────────────────────────────────────

export function calculateGymDailyIncome(
  memberCount: number,
  npcSatisfaction: number, // 0–100 avg
  equipmentLevel: number,  // avg level of equipment
  monthlyFee: bigint
): bigint {
  const dailyFee = monthlyFee / BigInt(30);
  const satisfactionMult = npcSatisfaction / 100;
  const equipmentBonus = 1 + (equipmentLevel - 1) * 0.1; // +10% per level above 1
  return BigInt(
    Math.floor(Number(dailyFee) * memberCount * satisfactionMult * equipmentBonus)
  );
}

// ─── Streak Update ────────────────────────────────────────────────────────────

export function calculateStreakUpdate(
  lastWorkoutAt: Date | null,
  currentStreak: number,
  longestStreak: number
): { newStreak: number; newLongest: number } {
  const now = new Date();
  if (!lastWorkoutAt) {
    return { newStreak: 1, newLongest: Math.max(1, longestStreak) };
  }

  const diffHours =
    (now.getTime() - lastWorkoutAt.getTime()) / (1000 * 60 * 60);

  if (diffHours <= 24) {
    // Same day: streak already counted
    return { newStreak: currentStreak, newLongest: longestStreak };
  } else if (diffHours <= 48) {
    // Yesterday: extend streak
    const newStreak = currentStreak + 1;
    return { newStreak, newLongest: Math.max(newStreak, longestStreak) };
  } else {
    // Missed a day: reset streak
    return { newStreak: 1, newLongest: longestStreak };
  }
}
