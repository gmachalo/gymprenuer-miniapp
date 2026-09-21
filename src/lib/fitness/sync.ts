/**
 * Real workout → character stats.
 *
 * This is the bridge that lets training in the physical world move the game
 * character. Sessions are pulled from the player's linked app (or pushed in by
 * a companion app), screened by the anti-cheat thresholds, converted into stat
 * gains with the same curve in-game workouts use, and written to the character
 * in one transaction. Since level-up is gated on stats, real training is what
 * carries a character over the floor.
 *
 * Two invariants hold the economy together:
 *   - a session counts exactly once (unique on provider + externalId)
 *   - a day's real-world gains are capped (DAILY_STAT_GAIN_CAP) so a bulk
 *     backfill of a year of history cannot mint a max-level character
 */

import type { PrismaClient, FitnessProvider, Intensity, PlanType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calculateStatGain, type StatBlock } from "@/lib/game/engine";
import type { ExternalWorkoutSummary } from "./adapter";
import { getProvider, type ProviderConnection } from "./providers";

// ─── Anti-cheat ──────────────────────────────────────────────────────────────

/** Below this a session is logged but awards nothing. */
export const MIN_REAL_DURATION_MINS = 15;
export const MIN_REAL_ADHERENCE_PCT = 40;
/** A single session can never be worth more than this per stat. */
export const MAX_GAIN_PER_SESSION = 6;
/** Total points, across all four stats, a player can bank from real workouts in a day. */
export const DAILY_STAT_GAIN_CAP = 12;
/** How far back a first-time link will reach when importing history. */
export const MAX_BACKFILL_DAYS = 30;

const ZERO: StatBlock = { strength: 0, stamina: 0, discipline: 0, metabolism: 0 };
const STAT_KEYS = ["strength", "stamina", "discipline", "metabolism"] as const;

export interface AppliedWorkout {
  externalId: string;
  date: string;
  durationMins: number;
  intensity: Intensity;
  planType: string;
  counted: boolean;
  reason?: string;
  gain: StatBlock;
}

export interface SyncResult {
  provider: FitnessProvider;
  pulled: number;
  imported: number;
  counted: number;
  skipped: number;
  totalGain: StatBlock;
  stats: StatBlock | null;
  workouts: AppliedWorkout[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addBlocks(a: StatBlock, b: StatBlock): StatBlock {
  return {
    strength: a.strength + b.strength,
    stamina: a.stamina + b.stamina,
    discipline: a.discipline + b.discipline,
    metabolism: a.metabolism + b.metabolism,
  };
}

function blockTotal(b: StatBlock): number {
  return b.strength + b.stamina + b.discipline + b.metabolism;
}

/**
 * Trim a gain block so its total does not exceed `budget`, spending the budget
 * on the largest components first — the shape of the workout survives the cut.
 */
function clampToBudget(gain: StatBlock, budget: number): StatBlock {
  if (budget <= 0) return { ...ZERO };
  if (blockTotal(gain) <= budget) return gain;

  const out: StatBlock = { ...ZERO };
  let left = budget;
  const ordered = [...STAT_KEYS].sort((a, b) => gain[b] - gain[a]);
  for (const key of ordered) {
    const take = Math.min(gain[key], left);
    out[key] = take;
    left -= take;
    if (left <= 0) break;
  }
  return out;
}

/** Stat gain a real session is worth, before the daily budget is applied. */
export function gainForRealWorkout(w: ExternalWorkoutSummary): StatBlock {
  const raw = calculateStatGain(w.planType, w.durationMins, w.intensity, 0);
  return {
    strength: Math.min(raw.strength, MAX_GAIN_PER_SESSION),
    stamina: Math.min(raw.stamina, MAX_GAIN_PER_SESSION),
    discipline: Math.min(raw.discipline, MAX_GAIN_PER_SESSION),
    metabolism: Math.min(raw.metabolism, MAX_GAIN_PER_SESSION),
  };
}

function screen(w: ExternalWorkoutSummary): string | null {
  if (w.durationMins < MIN_REAL_DURATION_MINS)
    return `Under ${MIN_REAL_DURATION_MINS} minutes`;
  if (w.adherencePct < MIN_REAL_ADHERENCE_PCT)
    return `Adherence below ${MIN_REAL_ADHERENCE_PCT}%`;
  return null;
}

function asPlanType(raw: string): PlanType {
  const valid: PlanType[] = ["STRENGTH", "FAT_LOSS", "HYBRID", "CALISTHENICS"];
  const up = raw.toUpperCase() as PlanType;
  return valid.includes(up) ? up : "HYBRID";
}

/** Points already banked from real workouts on the given day. */
async function spentOnDay(
  db: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  userId: string,
  day: Date
): Promise<number> {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const rows = await db.fitnessWorkout.findMany({
    where: { userId, counted: true, performedAt: { gte: start, lt: end } },
    select: { gainStrength: true, gainStamina: true, gainDiscipline: true, gainMetabolism: true },
  });
  return rows.reduce(
    (sum, r) => sum + r.gainStrength + r.gainStamina + r.gainDiscipline + r.gainMetabolism,
    0
  );
}

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * Apply a batch of normalised external workouts to the player's character.
 * Already-imported sessions are ignored, so this is safe to call with an
 * overlapping window.
 */
export async function importWorkouts(
  userId: string,
  provider: FitnessProvider,
  workouts: ExternalWorkoutSummary[]
): Promise<Omit<SyncResult, "provider" | "pulled">> {
  const character = await prisma.character.findFirst({
    where: { userId, isActive: true },
    select: { id: true, strength: true, stamina: true, discipline: true, metabolism: true },
  });

  const externalIds = workouts.map((w) => w.id);
  const known = externalIds.length
    ? await prisma.fitnessWorkout.findMany({
        where: { userId, provider, externalId: { in: externalIds } },
        select: { externalId: true },
      })
    : [];
  const seen = new Set(known.map((k) => k.externalId));

  const cutoff = new Date(Date.now() - MAX_BACKFILL_DAYS * 86_400_000);
  const fresh = workouts
    .filter((w) => !seen.has(w.id) && new Date(w.date) >= cutoff)
    // Oldest first, so the daily cap is spent in the order the player trained.
    .sort((a, b) => a.date.localeCompare(b.date));

  if (fresh.length === 0) {
    return {
      imported: 0,
      counted: 0,
      skipped: workouts.length,
      totalGain: { ...ZERO },
      stats: character
        ? {
            strength: character.strength,
            stamina: character.stamina,
            discipline: character.discipline,
            metabolism: character.metabolism,
          }
        : null,
      workouts: [],
    };
  }

  const applied: AppliedWorkout[] = [];
  let totalGain: StatBlock = { ...ZERO };

  const stats = await prisma.$transaction(async (tx) => {
    // Daily budgets are tracked per calendar day across this batch and whatever
    // was already banked before it.
    const budgets = new Map<string, number>();

    for (const w of fresh) {
      const performedAt = new Date(w.date);
      const failure = screen(w);
      let gain: StatBlock = { ...ZERO };
      let counted = false;

      if (!failure) {
        if (!budgets.has(w.date)) {
          budgets.set(w.date, DAILY_STAT_GAIN_CAP - (await spentOnDay(tx, userId, performedAt)));
        }
        const budget = budgets.get(w.date)!;
        gain = clampToBudget(gainForRealWorkout(w), budget);
        budgets.set(w.date, budget - blockTotal(gain));
        counted = blockTotal(gain) > 0;
      }

      await tx.fitnessWorkout.create({
        data: {
          userId,
          characterId: character?.id ?? null,
          provider,
          externalId: w.id,
          performedAt,
          durationMins: w.durationMins,
          intensity: w.intensity as Intensity,
          planType: asPlanType(w.planType),
          adherencePct: w.adherencePct,
          gainStrength: gain.strength,
          gainStamina: gain.stamina,
          gainDiscipline: gain.discipline,
          gainMetabolism: gain.metabolism,
          counted,
        },
      });

      totalGain = addBlocks(totalGain, gain);
      applied.push({
        externalId: w.id,
        date: w.date,
        durationMins: w.durationMins,
        intensity: w.intensity as Intensity,
        planType: w.planType,
        counted,
        reason: failure ?? (counted ? undefined : "Daily stat cap reached"),
        gain,
      });
    }

    if (!character) return null;
    if (blockTotal(totalGain) === 0) {
      return {
        strength: character.strength,
        stamina: character.stamina,
        discipline: character.discipline,
        metabolism: character.metabolism,
      };
    }

    return tx.character.update({
      where: { id: character.id },
      data: {
        strength: character.strength + totalGain.strength,
        stamina: character.stamina + totalGain.stamina,
        discipline: character.discipline + totalGain.discipline,
        metabolism: character.metabolism + totalGain.metabolism,
      },
      select: { strength: true, stamina: true, discipline: true, metabolism: true },
    });
  });

  return {
    imported: applied.length,
    counted: applied.filter((a) => a.counted).length,
    skipped: workouts.length - applied.length,
    totalGain,
    stats,
    workouts: applied,
  };
}

// ─── Pull ────────────────────────────────────────────────────────────────────

/**
 * Pull everything new from the player's linked app and apply it. Refreshes the
 * access token first when it has expired and the provider supports it.
 */
export async function pullFromProvider(userId: string): Promise<SyncResult> {
  const link = await prisma.fitnessConnection.findFirst({
    where: { userId, active: true },
    orderBy: { connectedAt: "desc" },
  });
  if (!link) throw new Error("No workout app is linked");

  const definition = getProvider(link.provider);
  if (!definition) throw new Error(`Unknown provider ${link.provider}`);
  if (definition.pushOnly)
    throw new Error(`${definition.label} pushes workouts to the game — there is nothing to pull`);

  let accessToken = link.accessToken;
  let refreshToken = link.refreshToken;
  let expiresAt = link.expiresAt;

  // Refresh an expired token before spending a request on a guaranteed 401.
  if (expiresAt && expiresAt.getTime() <= Date.now() + 60_000 && refreshToken && definition.refresh) {
    const tokens = await definition.refresh(refreshToken);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken ?? refreshToken;
    expiresAt = tokens.expiresAt ?? null;
    await prisma.fitnessConnection.update({
      where: { id: link.id },
      data: { accessToken, refreshToken, expiresAt },
    });
  }

  const conn: ProviderConnection = {
    userId,
    accessToken,
    refreshToken,
    expiresAt,
    externalUserId: link.externalUserId,
  };

  // Re-read a small overlap either side of the watermark: providers sometimes
  // backdate a session that finished syncing late. The externalId unique makes
  // the overlap free.
  const since = link.lastSyncedAt
    ? new Date(link.lastSyncedAt.getTime() - 86_400_000)
    : new Date(Date.now() - MAX_BACKFILL_DAYS * 86_400_000);

  let pulled: ExternalWorkoutSummary[];
  try {
    pulled = await definition.fetchWorkouts(conn, since);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await prisma.fitnessConnection.update({
      where: { id: link.id },
      data: { lastError: message.slice(0, 500) },
    });
    throw err;
  }

  const result = await importWorkouts(userId, link.provider, pulled);

  await prisma.fitnessConnection.update({
    where: { id: link.id },
    data: { lastSyncedAt: new Date(), lastError: null },
  });

  return { provider: link.provider, pulled: pulled.length, ...result };
}
