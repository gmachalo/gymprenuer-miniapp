import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { applyXpReward, addTotalXp } from "@/lib/game/engine";

const HOME_XP_COST = 5;
const HOME_XP_REWARD = 8;
const HOME_TOKEN_REWARD = BigInt(3);
const REST_DURATION_MS = 30 * 60 * 1000; // 30 min

// POST /api/game/workout/home — perform a home workout
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { intensity = "MEDIUM" } = body as { intensity?: string };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      currentXp: true,
      overflowXp: true,
      restUntil: true,
      offChainTokens: true,
      totalXp: true,
      level: true,
    },
  });

  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  // Check rest
  if (user.restUntil && user.restUntil > new Date()) {
    return Response.json(
      { error: "Character is resting", restUntil: user.restUntil.toISOString() },
      { status: 400 }
    );
  }

  // Check XP: deduct from overflow first, then currentXp
  const totalAvailable = user.currentXp + user.overflowXp;
  if (totalAvailable < HOME_XP_COST) {
    return Response.json(
      { error: "Not enough XP for a home workout", currentXp: user.currentXp, overflowXp: user.overflowXp },
      { status: 400 }
    );
  }

  // Intensity multiplier
  const multiplier = intensity === "HIGH" ? 1.5 : intensity === "LOW" ? 0.6 : 1.0;
  const xpRewardAmount = Math.floor(HOME_XP_REWARD * multiplier);
  const tokenReward = BigInt(Math.floor(Number(HOME_TOKEN_REWARD) * multiplier));

  // Deduct XP cost (overflow first)
  let newOverflow = user.overflowXp;
  let newCurrent = user.currentXp;
  if (newOverflow >= HOME_XP_COST) {
    newOverflow -= HOME_XP_COST;
  } else {
    const remainder = HOME_XP_COST - newOverflow;
    newOverflow = 0;
    newCurrent = Math.max(0, newCurrent - remainder);
  }

  // Add XP reward (overflow if current >= 100), capped at MAX_XP_ACCUMULATION total
  const xpUpdate = applyXpReward(newCurrent, newOverflow, xpRewardAmount);
  newCurrent = xpUpdate.currentXp;
  newOverflow = xpUpdate.overflowXp;
  const actualXpEarned = xpUpdate.xpAdded;

  // Rest if exhausted
  const exhausted = newCurrent === 0 && newOverflow === 0;
  const restUntil = exhausted ? new Date(Date.now() + REST_DURATION_MS) : null;

  const totalXpUpdate = addTotalXp(user.totalXp, actualXpEarned);

  // Find or create user's active character
  const character = await prisma.character.findFirst({
    where: { userId: session.user.id, isActive: true },
  });

  const [updatedUser, workout] = await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        currentXp: newCurrent,
        overflowXp: newOverflow,
        offChainTokens: user.offChainTokens + tokenReward,
        totalXp: totalXpUpdate.totalXp,
        ...(restUntil ? { restUntil } : {}),
      },
      select: { currentXp: true, overflowXp: true, offChainTokens: true, restUntil: true },
    }),
    prisma.workout.create({
      data: {
        userId: session.user.id,
        characterId: character?.id,
        source: "IN_GAME",
        durationMins: intensity === "HIGH" ? 45 : intensity === "LOW" ? 20 : 30,
        intensity: intensity as "LOW" | "MEDIUM" | "HIGH",
        adherencePct: 100,
        xpEarned: actualXpEarned,
        tokensEarned: tokenReward,
        fitnessBoost: 0.02,
      },
    }),
  ]);

  return Response.json({
    success: true,
    xpEarned: actualXpEarned,
    tokensEarned: tokenReward.toString(),
    currentXp: updatedUser.currentXp,
    overflowXp: updatedUser.overflowXp,
    exhausted,
    restUntil: updatedUser.restUntil?.toISOString() ?? null,
    workoutId: workout.id,
  });
}
