/**
 * Prisma seed script
 * Run: npx prisma db seed
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";

// Load env vars (Prisma CLI doesn't load Next.js env automatically)
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });


async function main() {
  console.log("🌱 Seeding database...");

  // ── Workout Plans ──────────────────────────────────────────────────────────
  const plans = await Promise.all([
    prisma.workoutPlan.upsert({
      where: { id: "plan-strength" },
      update: {},
      create: {
        id: "plan-strength",
        name: "Iron Foundations",
        type: "STRENGTH",
        description: "Build raw strength through compound lifts. Bench, squat, deadlift.",
        targetStats: { strength: 2, stamina: 1 },
        durationWeeks: 8,
        isSystem: true,
      },
    }),
    prisma.workoutPlan.upsert({
      where: { id: "plan-fatloss" },
      update: {},
      create: {
        id: "plan-fatloss",
        name: "Lean Machine",
        type: "FAT_LOSS",
        description: "High-intensity fat loss protocol. HIIT, cardio, calorie burn.",
        targetStats: { stamina: 2, metabolism: 2 },
        durationWeeks: 6,
        isSystem: true,
      },
    }),
    prisma.workoutPlan.upsert({
      where: { id: "plan-hybrid" },
      update: {},
      create: {
        id: "plan-hybrid",
        name: "Athlete Protocol",
        type: "HYBRID",
        description: "Balanced strength and conditioning for overall fitness.",
        targetStats: { strength: 1, stamina: 1, discipline: 1 },
        durationWeeks: 10,
        isSystem: true,
      },
    }),
    prisma.workoutPlan.upsert({
      where: { id: "plan-calisthenics" },
      update: {},
      create: {
        id: "plan-calisthenics",
        name: "Body Control",
        type: "CALISTHENICS",
        description: "Master your bodyweight. Pull-ups, dips, handstands, planches.",
        targetStats: { strength: 1, stamina: 1, discipline: 2 },
        durationWeeks: 12,
        isSystem: true,
      },
    }),
  ]);

  console.log(`✅ Created ${plans.length} workout plans`);

  // ── System Gyms ───────────────────────────────────────────────────────────
  const gyms = await Promise.all([
    prisma.gym.upsert({
      where: { id: "gym-ironhaven" },
      update: {},
      create: {
        id: "gym-ironhaven",
        name: "Iron Haven",
        description: "The OG strength training facility. Classic iron, no nonsense.",
        type: "SYSTEM",
        reputation: 85,
        memberCount: 142,
        maxMembers: 200,
        monthlyFee: BigInt(50),
        metadata: { tier: "starter", speciality: "strength" },
      },
    }),
    prisma.gym.upsert({
      where: { id: "gym-burnzone" },
      update: {},
      create: {
        id: "gym-burnzone",
        name: "The Burn Zone",
        description: "High-intensity cardio and fat loss specialists. Join if you dare.",
        type: "SYSTEM",
        reputation: 78,
        memberCount: 98,
        maxMembers: 150,
        monthlyFee: BigInt(60),
        metadata: { tier: "starter", speciality: "fat_loss" },
      },
    }),
    prisma.gym.upsert({
      where: { id: "gym-titanpeak" },
      update: { tier: 2 },
      create: {
        id: "gym-titanpeak",
        name: "Titan Peak",
        description: "Elite hybrid training for serious athletes. Compete or go home.",
        type: "SYSTEM",
        tier: 2,
        reputation: 95,
        memberCount: 67,
        maxMembers: 100,
        monthlyFee: BigInt(120),
        metadata: { tier: "elite", speciality: "hybrid" },
      },
    }),
    prisma.gym.upsert({
      where: { id: "gym-gravity" },
      update: {},
      create: {
        id: "gym-gravity",
        name: "Zero Gravity",
        description: "Calisthenics & movement gym. Masters of bodyweight.",
        type: "SYSTEM",
        reputation: 72,
        memberCount: 54,
        maxMembers: 80,
        monthlyFee: BigInt(40),
        metadata: { tier: "starter", speciality: "calisthenics" },
      },
    }),
    // Low-level (tier 1) gyms — join with XP only, no GYMFIT required
    prisma.gym.upsert({
      where: { id: "gym-cornerstone" },
      update: {},
      create: {
        id: "gym-cornerstone",
        name: "Cornerstone Fitness",
        description: "Friendly neighborhood gym for beginners. No tokens needed, just show up and put in the work.",
        type: "SYSTEM",
        tier: 1,
        reputation: 60,
        memberCount: 210,
        maxMembers: 300,
        monthlyFee: BigInt(50),
        metadata: { tier: "starter", speciality: "general" },
      },
    }),
    prisma.gym.upsert({
      where: { id: "gym-basecamp" },
      update: {},
      create: {
        id: "gym-basecamp",
        name: "Base Camp Training",
        description: "Where every trainer starts. Earn your way in with XP alone.",
        type: "SYSTEM",
        tier: 1,
        reputation: 55,
        memberCount: 175,
        maxMembers: 250,
        monthlyFee: BigInt(50),
        metadata: { tier: "starter", speciality: "general" },
      },
    }),
  ]);

  console.log(`✅ Created ${gyms.length} system gyms`);

  // ── NPC Clients for system gyms ────────────────────────────────────────────
  const npcNames = [
    "Alex M.", "Jordan T.", "Sam K.", "Riley B.", "Morgan P.",
    "Casey F.", "Drew L.", "Quinn A.", "Blake H.", "Avery S.",
  ];
  const goals = ["strength", "weight_loss", "general"];

  for (const gym of gyms) {
    const npcCount = 5;
    for (let i = 0; i < npcCount; i++) {
      await prisma.npcClient.upsert({
        where: { id: `npc-${gym.id}-${i}` },
        update: {},
        create: {
          id: `npc-${gym.id}-${i}`,
          gymId: gym.id,
          name: npcNames[i % npcNames.length],
          goal: goals[i % goals.length],
          satisfaction: 60 + Math.floor(Math.random() * 30),
          spendingRate: BigInt(5 + Math.floor(Math.random() * 15)),
          active: true,
        },
      });
    }
  }

  // ── Equipment for system gyms ──────────────────────────────────────────────
  const gymEquipment = [
    { name: "Power Rack",    type: "strength",    cost: BigInt(200), statBonus: { strength: 0.05 } },
    { name: "Treadmill",     type: "cardio",      cost: BigInt(150), statBonus: { stamina: 0.05 } },
    { name: "Dumbbells Set", type: "free_weights", cost: BigInt(100), statBonus: { strength: 0.03 } },
  ];

  for (const gym of gyms) {
    for (const eq of gymEquipment) {
      await prisma.equipment.upsert({
        where: { id: `eq-${gym.id}-${eq.name.replace(/\s/g, "")}` },
        update: {},
        create: {
          id: `eq-${gym.id}-${eq.name.replace(/\s/g, "")}`,
          gymId: gym.id,
          name: eq.name,
          type: eq.type,
          level: 1,
          purchaseCost: eq.cost,
          upgradeCost: BigInt(Number(eq.cost) * 2),
          capacity: 5,
          statBonus: eq.statBonus,
        },
      });
    }
  }

  console.log("✅ Seeded NPC clients and equipment");
  console.log("🎉 Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
