import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  calculateWorkoutReward,
  calculateStatGain,
  calculateStreakUpdate,
  calculateWorkoutXpCost,
  workoutXpCost,
  spendXp,
} from "@/lib/game/engine";

const REST_DURATION_MS = 30 * 60 * 1000; // 30 min

// POST /api/game/workout/complete
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const { planId, durationMins, intensity, adherencePct } = body as {
    planId: string;
    durationMins: number;
    intensity: "LOW" | "MEDIUM" | "HIGH";
    adherencePct: number;
  };

  if (!durationMins || durationMins < 1)
    return Response.json({ error: "Invalid durationMins" }, { status: 400 });

  const [user, character, plan, streak, todayCount, fitnessSync] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.character.findFirst({ where: { userId, isActive: true } }),
    planId ? prisma.workoutPlan.findUnique({ where: { id: planId } }) : null,
    prisma.streak.findUnique({ where: { userId } }),
    prisma.workout.count({
      where: {
        userId,
        completedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.fitnessSync.findFirst({
      where: {
        userId,
        syncDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
        applied: false,
      },
      orderBy: { syncDate: "desc" },
    }),
  ]);

  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  // Check rest
  if (user.restUntil && user.restUntil > new Date()) {
    return Response.json(
      { error: "Character is resting", restUntil: user.restUntil.toISOString() },
      { status: 400 }
    );
  }

  // XP is spent, not earned, by working out — a depleted pool blocks further workouts.
  const totalAvailable = user.currentXp + user.overflowXp;
  if (totalAvailable <= 0) {
    return Response.json(
      { error: "No XP left — rest to recover before working out.", currentXp: user.currentXp, overflowXp: user.overflowXp },
      { status: 402 }
    );
  }

  const xpCost = workoutXpCost(calculateWorkoutXpCost(durationMins, intensity), user.level);
  if (totalAvailable < xpCost) {
    return Response.json(
      { error: "Not enough XP for this workout", currentXp: user.currentXp, overflowXp: user.overflowXp, xpCost },
      { status: 402 }
    );
  }

  const spent = spendXp(user.currentXp, user.overflowXp, xpCost);
  const newCurrent = spent.currentXp;
  const newOverflow = spent.overflowXp;

  const fitnessBoost = Number(fitnessSync?.fitnessBoost ?? 0);
  const streakCount = streak?.currentStreak ?? 0;

  const reward = calculateWorkoutReward({
    durationMins,
    intensity,
    adherencePct: adherencePct ?? 100,
    streakCount,
    fitnessBoost,
    dailyWorkoutCount: todayCount,
  });

  // Rest if exhausted
  const exhausted = newCurrent === 0 && newOverflow === 0;
  const restUntil = exhausted ? new Date(Date.now() + REST_DURATION_MS) : null;

  // Update streak
  const streakUpdate = calculateStreakUpdate(
    streak?.lastWorkoutAt ?? null,
    streakCount,
    streak?.longestStreak ?? 0
  );

  // Stat gains — boosted by the same synced-fitness multiplier as tokens.
  // Leveling (and the transformation stage it drives) is stats-only now, so
  // this is the entire progression payoff of a workout beyond GYMFIT.
  const statGain = character && plan
    ? calculateStatGain(plan.type, durationMins, intensity, reward.fitnessBoostApplied)
    : null;

  // Run all DB writes in a transaction
  await prisma.$transaction(async (tx) => {
    // 1. Create workout record
    await tx.workout.create({
      data: {
        userId,
        characterId: character?.id,
        planId: plan?.id,
        source: "IN_GAME",
        durationMins,
        intensity,
        adherencePct,
        xpEarned: 0, // workouts no longer earn XP, only spend it (see xpCost)
        tokensEarned: reward.totalTokens,
        fitnessBoost: reward.fitnessBoostApplied,
      },
    });

    // 2. Update user tokens, XP bar & overflow
    await tx.user.update({
      where: { id: userId },
      data: {
        currentXp: newCurrent,
        overflowXp: newOverflow,
        offChainTokens: user.offChainTokens + reward.totalTokens,
        lastXpRegenAt: new Date(),
        ...(restUntil ? { restUntil } : {}),
      },
    });

    // 3. Update character stats — transformationStage is recomputed only on
    // level-up (see /api/game/level-up), since level is what now drives it.
    if (character && statGain) {
      await tx.character.update({
        where: { id: character.id },
        data: {
          strength: character.strength + statGain.strength,
          stamina: character.stamina + statGain.stamina,
          discipline: character.discipline + statGain.discipline,
          metabolism: character.metabolism + statGain.metabolism,
        },
      });
    }

    // 4. Update streak
    await tx.streak.upsert({
      where: { userId },
      create: {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastWorkoutAt: new Date(),
      },
      update: {
        currentStreak: streakUpdate.newStreak,
        longestStreak: streakUpdate.newLongest,
        lastWorkoutAt: new Date(),
      },
    });

    // 5. Mark fitness sync as applied
    if (fitnessSync) {
      await tx.fitnessSync.update({
        where: { id: fitnessSync.id },
        data: { applied: true },
      });
    }

    // 6. Create reward record
    await tx.reward.create({
      data: {
        userId,
        type: "WORKOUT",
        baseAmount: reward.baseTokens,
        bonusAmount: reward.bonusTokens,
        fitnessBoost: reward.fitnessBoostApplied,
        totalAmount: reward.totalTokens,
        claimed: true,
      },
    });

    // 7. Log transaction
    await tx.transaction.create({
      data: {
        userId,
        type: "EARN",
        amount: reward.totalTokens,
        balanceBefore: user.offChainTokens,
        balanceAfter: user.offChainTokens + reward.totalTokens,
        description: `Workout reward (${durationMins}min ${intensity})`,
      },
    });
  });

  return Response.json({
    reward,
    statGain,
    newStreak: streakUpdate.newStreak,
    xpCost,
    currentXp: newCurrent,
    overflowXp: newOverflow,
    exhausted,
    restUntil: restUntil?.toISOString() ?? null,
  });
}

// GET /api/game/workout/complete — workout history
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const workouts = await prisma.workout.findMany({
    where: { userId: session.user.id },
    orderBy: { completedAt: "desc" },
    take: limit,
    include: { plan: { select: { name: true, type: true } } },
  });

  return Response.json({ workouts });
}
