import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  spendXp,
  calculateStatGain,
  equipmentSpec,
  equipmentTokenYield,
  homeEquipment,
  HOME_EQUIPMENT_GRADE,
  workoutXpCost,
} from "@/lib/game/engine";

const REST_DURATION_MS = 30 * 60 * 1000; // 30 min

// POST /api/game/workout/home — perform a home workout on grade-1 kit. XP is
// spent, not earned, and the workout is refused outright once the pool is at 0.
// Cost, payout and stat gain all come from the equipment catalog, so they match
// what the home tiles and the HomeScene show.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { equipmentId } = body as { equipmentId?: string };

  // Only grade-1 home kit can be used here; an unknown or gym-grade id falls
  // back to the first home piece rather than paying out a gym machine's rate.
  const requested = equipmentId ? equipmentSpec(equipmentId) : null;
  const spec =
    requested && requested.grade === HOME_EQUIPMENT_GRADE ? requested : homeEquipment()[0];
  const intensity = spec.intensity;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currentXp: true,
      overflowXp: true,
      restUntil: true,
      offChainTokens: true,
      level: true,
    },
  });

  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  // The kit's base cost, scaled up by the player's level.
  const xpCost = workoutXpCost(spec.xpCost, user.level);

  // Check rest
  if (user.restUntil && user.restUntil > new Date()) {
    return Response.json(
      { error: "Character is resting", restUntil: user.restUntil.toISOString() },
      { status: 400 }
    );
  }

  const totalAvailable = user.currentXp + user.overflowXp;
  if (totalAvailable <= 0) {
    return Response.json(
      { error: "No XP left — rest to recover before working out.", currentXp: user.currentXp, overflowXp: user.overflowXp },
      { status: 402 }
    );
  }
  if (totalAvailable < xpCost) {
    return Response.json(
      { error: `Not enough XP for ${spec.name}`, currentXp: user.currentXp, overflowXp: user.overflowXp, xpCost },
      { status: 402 }
    );
  }

  const tokenReward = BigInt(equipmentTokenYield(spec, 1));

  const spent = spendXp(user.currentXp, user.overflowXp, xpCost);
  const newCurrent = spent.currentXp;
  const newOverflow = spent.overflowXp;

  // Rest if exhausted
  const exhausted = newCurrent === 0 && newOverflow === 0;
  const restUntil = exhausted ? new Date(Date.now() + REST_DURATION_MS) : null;

  // Find or create user's active character
  const character = await prisma.character.findFirst({
    where: { userId, isActive: true },
  });

  const durationMins = intensity === "HIGH" ? 45 : intensity === "LOW" ? 20 : 30;

  // Stat gains — level-up is gated on stats as well as XP, so home workouts
  // have to move stats too, or the gate is unreachable without a gym.
  const statGain = character
    ? calculateStatGain(spec.planType, durationMins, intensity, 0.02)
    : null;

  const [updatedUser, workout, updatedCharacter] = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        currentXp: newCurrent,
        overflowXp: newOverflow,
        offChainTokens: user.offChainTokens + tokenReward,
        lastXpRegenAt: new Date(),
        ...(restUntil ? { restUntil } : {}),
      },
      select: { currentXp: true, overflowXp: true, offChainTokens: true, restUntil: true },
    });

    const workout = await tx.workout.create({
      data: {
        userId,
        characterId: character?.id,
        source: "IN_GAME",
        durationMins,
        intensity: intensity as "LOW" | "MEDIUM" | "HIGH",
        adherencePct: 100,
        xpEarned: 0, // workouts no longer earn XP, only spend it
        tokensEarned: tokenReward,
        fitnessBoost: 0.02,
      },
    });

    const updatedCharacter = character && statGain
      ? await tx.character.update({
          where: { id: character.id },
          data: {
            strength:   character.strength   + statGain.strength,
            stamina:    character.stamina    + statGain.stamina,
            discipline: character.discipline + statGain.discipline,
            metabolism: character.metabolism + statGain.metabolism,
          },
          select: { strength: true, stamina: true, discipline: true, metabolism: true },
        })
      : null;

    return [updatedUser, workout, updatedCharacter] as const;
  });

  return Response.json({
    success: true,
    xpSpent: xpCost,
    tokensEarned: tokenReward.toString(),
    currentXp: updatedUser.currentXp,
    overflowXp: updatedUser.overflowXp,
    exhausted,
    restUntil: updatedUser.restUntil?.toISOString() ?? null,
    workoutId: workout.id,
    statGain,
    stats: updatedCharacter ?? null,
  });
}
