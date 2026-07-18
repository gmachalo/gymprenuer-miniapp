import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { applyXpReward, addTotalXp } from "@/lib/game/engine";

const REST_DURATION_MS = 30 * 60 * 1000;

// POST /api/game/workout/gym — called by Phaser GymScene on workout complete
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    xpCost = 8,
    xpEarned = 12,
    tokensEarned = 5,
    intensity = "MEDIUM",
    equipmentId = "unknown",
  } = body as {
    xpCost?: number;
    xpEarned?: number;
    tokensEarned?: number;
    intensity?: string;
    equipmentId?: string;
  };

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

  // Deduct XP cost (overflow first, then current)
  let newOverflow = user.overflowXp;
  let newCurrent  = user.currentXp;

  const totalAvailable = newCurrent + newOverflow;
  if (totalAvailable < xpCost) {
    // Not enough XP but allow workout (free) — just don't award extra
    // to avoid blocking the game
  } else {
    if (newOverflow >= xpCost) {
      newOverflow -= xpCost;
    } else {
      const remainder = xpCost - newOverflow;
      newOverflow = 0;
      newCurrent = Math.max(0, newCurrent - remainder);
    }
  }

  // Add XP reward — overflow if bar is full, capped at 10 000 total
  const xpReward = applyXpReward(newCurrent, newOverflow, xpEarned);
  newCurrent = xpReward.currentXp;
  newOverflow = xpReward.overflowXp;
  const actualXpEarned = xpReward.xpAdded;

  // Rest if exhausted
  const exhausted = newCurrent === 0 && newOverflow === 0;
  const restUntil = exhausted ? new Date(Date.now() + REST_DURATION_MS) : null;

  const tokenBigInt = BigInt(Math.max(0, Math.floor(tokensEarned)));
  const totalXpUpdate = addTotalXp(user.totalXp, actualXpEarned);

  const character = await prisma.character.findFirst({
    where: { userId: session.user.id, isActive: true },
  });

  const [updatedUser, workout] = await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        currentXp:      newCurrent,
        overflowXp:     newOverflow,
        offChainTokens: user.offChainTokens + tokenBigInt,
        totalXp:        totalXpUpdate.totalXp,
        ...(restUntil ? { restUntil } : {}),
        lastXpRegenAt: new Date(),
      },
      select: {
        currentXp: true,
        overflowXp: true,
        offChainTokens: true,
        restUntil: true,
      },
    }),
    prisma.workout.create({
      data: {
        userId:       session.user.id,
        characterId:  character?.id,
        source:       "IN_GAME",
        durationMins: intensity === "HIGH" ? 45 : intensity === "LOW" ? 20 : 30,
        intensity:    intensity as "LOW" | "MEDIUM" | "HIGH",
        adherencePct: 100,
        xpEarned:       actualXpEarned,
        tokensEarned: tokenBigInt,
        fitnessBoost: 0.03,
      },
    }),
  ]);

  return Response.json({
    success:     true,
    xpEarned:     actualXpEarned,
    tokensEarned: tokenBigInt.toString(),
    currentXp:   updatedUser.currentXp,
    overflowXp:  updatedUser.overflowXp,
    exhausted,
    restUntil:   updatedUser.restUntil?.toISOString() ?? null,
    workoutId:   workout.id,
  });
}
