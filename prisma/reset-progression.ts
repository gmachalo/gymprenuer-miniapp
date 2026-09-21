/**
 * Progression reset — rebases every account onto the level × 10 stat floor.
 *
 * The old floor was level × 4 and characters opened on 6–14 stats. Under the
 * new curve those characters sit below their own level's floor and can never
 * level again, so this puts everyone back on a coherent footing:
 *
 *   Characters  stats  → startingStatsFor(...), transformationStage → 0
 *   Users       level  → 1, currentXp → 100, overflowXp → 0, totalXp → 0,
 *                        restUntil cleared, regen clock restarted
 *
 * Signup selections were never persisted (plans are attached to workouts, not
 * characters), so the opening block is reconstructed from what the database
 * does record: body type, the plan types the player has actually trained, and
 * whether they belong to a gym.
 *
 * Tokens, workout history, gyms and streaks are left untouched.
 *
 *   npx ts-node --compiler-options {"module":"CommonJS"} prisma/reset-progression.ts            # dry run
 *   npx ts-node --compiler-options {"module":"CommonJS"} prisma/reset-progression.ts --apply
 *
 * Flags:
 *   --apply            actually write (default is a dry run that changes nothing)
 *   --user <id>        limit to one user
 *   --keep-imports     keep imported real-world workouts (default clears them so
 *                      the sessions can be pulled again and re-award their stats)
 */

import * as path from "path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../.env") });
config({ path: path.resolve(__dirname, "../.env.local"), override: true });

/* eslint-disable @typescript-eslint/no-require-imports */
require("tsconfig-paths").register({
  baseUrl: path.resolve(__dirname, ".."),
  paths: { "@/*": ["src/*"] },
});

const { prisma } = require("../src/lib/db/prisma");
const {
  startingStatsFor,
  statRequiredForLevel,
  STAT_PER_LEVEL,
} = require("../src/lib/game/engine");

const DEFAULT_CURRENT_XP = 100; // matches the User.currentXp schema default

interface StatBlock {
  strength: number;
  stamina: number;
  discipline: number;
  metabolism: number;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const keepImports = args.includes("--keep-imports");
const userFlag = args.indexOf("--user");
const onlyUserId = userFlag >= 0 ? args[userFlag + 1] : null;

function fmt(block: StatBlock): string {
  return `STR ${block.strength} / STA ${block.stamina} / DIS ${block.discipline} / MET ${block.metabolism}`;
}

async function main() {
  console.log(
    apply
      ? "── Progression reset (APPLYING) ──"
      : "── Progression reset (dry run — pass --apply to write) ──"
  );
  console.log(`New stat floor: level × ${STAT_PER_LEVEL} (level 1 needs ${statRequiredForLevel(1)})\n`);

  const users = await prisma.user.findMany({
    where: onlyUserId ? { id: onlyUserId } : {},
    select: {
      id: true,
      email: true,
      username: true,
      level: true,
      currentXp: true,
      overflowXp: true,
      totalXp: true,
      characters: {
        select: {
          id: true,
          name: true,
          bodyType: true,
          isActive: true,
          strength: true,
          stamina: true,
          discipline: true,
          metabolism: true,
          transformationStage: true,
        },
      },
      gymMemberships: { select: { id: true }, take: 1 },
    },
  });

  if (users.length === 0) {
    console.log("No users matched — nothing to do.");
    return;
  }

  let charactersTouched = 0;

  for (const user of users) {
    const who = user.username ?? user.email ?? user.id;

    // Which goals has this player actually trained? That is the closest thing
    // on record to the plans they picked at signup.
    const trained = await prisma.workout.findMany({
      where: { userId: user.id, planId: { not: null } },
      select: { plan: { select: { type: true } } },
      distinct: ["planId"],
    });
    const planTypes = [
      ...new Set(
        trained
          .map((w: { plan: { type: string } | null }) => w.plan?.type)
          .filter((t: string | undefined): t is string => !!t)
      ),
    ];
    const workoutEnv = user.gymMemberships.length > 0 ? "GYM" : "HOME";

    console.log(`\n${who}`);
    console.log(
      `  level ${user.level} → 1 · XP ${user.currentXp}+${user.overflowXp} → ${DEFAULT_CURRENT_XP}+0 · lifetime ${user.totalXp} → 0`
    );
    console.log(
      `  reconstructed from: ${planTypes.length ? planTypes.join(", ") : "no trained plans"} · ${workoutEnv}`
    );

    for (const character of user.characters) {
      const next: StatBlock = startingStatsFor({
        bodyType: character.bodyType,
        planTypes,
        workoutEnv,
      });
      const current: StatBlock = {
        strength: character.strength,
        stamina: character.stamina,
        discipline: character.discipline,
        metabolism: character.metabolism,
      };
      console.log(
        `  ${character.name}${character.isActive ? "" : " (inactive)"}: ${fmt(current)} → ${fmt(next)}` +
          `  · stage ${character.transformationStage} → 0`
      );
      charactersTouched++;

      if (apply) {
        await prisma.character.update({
          where: { id: character.id },
          data: { ...next, transformationStage: 0 },
        });
      }
    }

    if (apply) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          level: 1,
          currentXp: DEFAULT_CURRENT_XP,
          overflowXp: 0,
          totalXp: 0,
          restUntil: null,
          lastXpRegenAt: new Date(),
        },
      });
    }
  }

  // Imported real-world sessions are deduped by external id, so leaving them in
  // place would strand their stat gains — the same sessions could never be
  // pulled again. Clearing them lets a re-pull re-award everything.
  const importedCount = await prisma.fitnessWorkout.count({
    where: onlyUserId ? { userId: onlyUserId } : {},
  });
  if (keepImports) {
    console.log(
      `\nKeeping ${importedCount} imported real-world workout(s) — their stat gains are not re-awardable.`
    );
  } else {
    console.log(`\nClearing ${importedCount} imported real-world workout(s) so they can be pulled again.`);
    if (apply) {
      await prisma.fitnessWorkout.deleteMany({ where: onlyUserId ? { userId: onlyUserId } : {} });
      await prisma.fitnessConnection.updateMany({
        where: onlyUserId ? { userId: onlyUserId } : {},
        data: { lastSyncedAt: null },
      });
    }
  }

  console.log(
    `\n${apply ? "Reset" : "Would reset"} ${users.length} user(s) and ${charactersTouched} character(s).`
  );
  if (!apply) console.log("Nothing was written. Re-run with --apply to commit.");
}

main()
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
