/**
 * Repair gym equipment rows whose `type` is not a catalog key.
 *
 * The equipment catalog (EQUIPMENT_CATALOG in src/lib/game/engine.ts) is what
 * the game world, the dashboard tiles, the gym page and the workout payout all
 * resolve a machine by. Rows seeded before the catalog existed carry broad
 * category strings ("strength", "cardio", "free_weights") instead, so they
 * render nowhere and are worth nothing.
 *
 * This maps each orphan onto the closest catalog piece the gym's tier can host,
 * keeping its upgrade level. Anything that cannot be mapped — or that would
 * duplicate a piece the gym already has — is removed, and any gym left with an
 * empty floor is given the tier-appropriate starter set.
 *
 *   npm run db:repair-equipment            # dry run
 *   npm run db:repair-equipment -- --apply
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
  equipmentSpec,
  equipmentUpgradeCost,
  equipmentGradeForGymTier,
  equipmentAvailableForTier,
} = require("../src/lib/game/engine");

interface Spec {
  type: string;
  name: string;
  grade: number;
  planType: string;
  intensity: string;
  purchaseCost: number;
  capacity: number;
}

const apply = process.argv.includes("--apply");

/** Legacy category / display name → the catalog piece that best replaces it. */
const LEGACY_MAP: Record<string, string[]> = {
  // Ordered by preference; the first the gym's tier can host wins.
  strength: ["powerrack", "squat", "bench"],
  free_weights: ["bench", "cable"],
  cardio: ["treadmill", "bike"],
  "power rack": ["powerrack", "squat", "bench"],
  "dumbbells set": ["bench", "cable"],
  treadmill: ["treadmill"],
};

/** Starter floor for a gym left with nothing after the repair. */
function starterFloor(tier: number): Spec[] {
  return equipmentAvailableForTier(tier)
    .filter((s: Spec) => s.grade === 2)
    .slice(0, 3);
}

function pickReplacement(
  row: { type: string; name: string },
  tier: number,
  taken: Set<string>
): Spec | null {
  const maxGrade = equipmentGradeForGymTier(tier);
  const candidates = [
    ...(LEGACY_MAP[row.type.toLowerCase()] ?? []),
    ...(LEGACY_MAP[row.name.toLowerCase()] ?? []),
  ];
  for (const type of candidates) {
    const spec = equipmentSpec(type) as Spec | null;
    if (spec && spec.grade <= maxGrade && !taken.has(spec.type)) return spec;
  }
  return null;
}

async function main() {
  console.log(
    apply ? "── Equipment repair (APPLYING) ──" : "── Equipment repair (dry run — pass --apply) ──"
  );

  const gyms = await prisma.gym.findMany({
    select: {
      id: true,
      name: true,
      tier: true,
      equipment: { select: { id: true, type: true, name: true, level: true } },
    },
    orderBy: { name: "asc" },
  });

  let converted = 0;
  let removed = 0;
  let added = 0;

  for (const gym of gyms) {
    const orphans = gym.equipment.filter((e: { type: string }) => !equipmentSpec(e.type));
    if (orphans.length === 0 && gym.equipment.length > 0) continue;

    console.log(`\n${gym.name} (tier ${gym.tier}, max grade ${equipmentGradeForGymTier(gym.tier)})`);

    const taken = new Set<string>(
      gym.equipment.filter((e: { type: string }) => equipmentSpec(e.type)).map((e: { type: string }) => e.type)
    );

    for (const row of orphans) {
      const spec = pickReplacement(row, gym.tier, taken);
      if (!spec) {
        console.log(`  ✗ ${row.name} (type="${row.type}") — no fit, removing`);
        removed++;
        if (apply) await prisma.equipment.delete({ where: { id: row.id } });
        continue;
      }
      taken.add(spec.type);
      console.log(`  → ${row.name} (type="${row.type}") becomes ${spec.name} (${spec.type}), keeping Lv.${row.level}`);
      converted++;
      if (apply) {
        await prisma.equipment.update({
          where: { id: row.id },
          data: {
            type: spec.type,
            name: spec.name,
            capacity: spec.capacity,
            purchaseCost: BigInt(spec.purchaseCost),
            upgradeCost: equipmentUpgradeCost(spec, row.level),
            statBonus: { planType: spec.planType, intensity: spec.intensity, grade: spec.grade },
          },
        });
      }
    }

    // A gym with nothing left on the floor would render the default fallback
    // rather than anything it actually owns — give it a real starter set.
    if (taken.size === 0) {
      for (const spec of starterFloor(gym.tier)) {
        console.log(`  + installing ${spec.name} (${spec.type})`);
        added++;
        if (apply) {
          await prisma.equipment.create({
            data: {
              gymId: gym.id,
              name: spec.name,
              type: spec.type,
              level: 1,
              purchaseCost: BigInt(spec.purchaseCost),
              upgradeCost: equipmentUpgradeCost(spec, 1),
              capacity: spec.capacity,
              statBonus: { planType: spec.planType, intensity: spec.intensity, grade: spec.grade },
            },
          });
        }
      }
    }
  }

  console.log(
    `\n${apply ? "Repaired" : "Would repair"}: ${converted} converted, ${removed} removed, ${added} installed.`
  );
  if (!apply) console.log("Nothing was written. Re-run with --apply to commit.");
}

main()
  .catch((err) => {
    console.error("Repair failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
