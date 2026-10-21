import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  spendXp,
  calculateStatGain,
  trainerPayMicroForTier,
  MICRO_PER_GYMFIT,
  equipmentSpec,
  equipmentTokenYield,
  HOME_EQUIPMENT_GRADE,
  workoutXpCost,
} from "@/lib/game/engine";

const REST_DURATION_MS = 30 * 60 * 1000;

// POST /api/game/workout/gym — called by Phaser GymScene on workout complete.
// XP is spent, not earned: this only ever deducts xpCost, and refuses the
// workout outright once the pool is at 0.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const {
    xpCost = 8,
    tokensEarned = 5,
    intensity = "MEDIUM",
    equipmentId = "unknown",
  } = body as {
    xpCost?: number;
    tokensEarned?: number;
    intensity?: string;
    equipmentId?: string;
  };

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

  // Check rest
  if (user.restUntil && user.restUntil > new Date()) {
    return Response.json(
      { error: "Character is resting", restUntil: user.restUntil.toISOString() },
      { status: 400 }
    );
  }

  const [character, gymMembership] = await Promise.all([
    prisma.character.findFirst({ where: { userId, isActive: true } }),
    prisma.gymMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: "desc" },
      select: {
        gym: {
          select: {
            id: true,
            tier: true,
            equipment: { select: { id: true, type: true, level: true } },
          },
        },
      },
    }),
  ]);

  // Cost and payout both come from the machine that was actually used, at the
  // level the owner has upgraded it to — a better-equipped gym pays better,
  // which is the whole point of tiering up. The client's figures are only a
  // fallback for equipment the catalog does not know.
  const installed = gymMembership?.gym.equipment.find((e) => e.type === equipmentId) ?? null;
  const catalogSpec = equipmentSpec(equipmentId);

  // A machine pays only if the player actually has access to it: it is
  // installed at their gym, or it is grade-1 home kit everyone owns. Without
  // this, any client could claim a grade-6 machine's payout from a tier-1 gym
  // (or from no gym at all) just by naming it.
  if (catalogSpec && !installed && catalogSpec.grade > HOME_EQUIPMENT_GRADE) {
    return Response.json(
      {
        error: gymMembership
          ? `Your gym does not have a ${catalogSpec.name}.`
          : `${catalogSpec.name} is gym equipment — join a gym to train on it.`,
      },
      { status: 403 }
    );
  }

  const spec = installed ? equipmentSpec(installed.type) : catalogSpec;
  const equipmentLevel = installed?.level ?? 1;

  // The machine's base cost, scaled up by the player's level.
  const xpSpend = workoutXpCost(spec ? spec.xpCost : xpCost, user.level);
  const tokenBigInt = BigInt(
    Math.max(0, Math.floor(spec ? equipmentTokenYield(spec, equipmentLevel) : tokensEarned))
  );

  const totalAvailable = user.currentXp + user.overflowXp;
  if (totalAvailable <= 0) {
    return Response.json(
      { error: "No XP left — rest to recover before working out.", currentXp: user.currentXp, overflowXp: user.overflowXp },
      { status: 402 }
    );
  }
  if (totalAvailable < xpSpend) {
    return Response.json(
      { error: "Not enough XP for this workout", currentXp: user.currentXp, overflowXp: user.overflowXp, xpCost: xpSpend },
      { status: 402 }
    );
  }

  const spent = spendXp(user.currentXp, user.overflowXp, xpSpend);
  const newCurrent = spent.currentXp;
  const newOverflow = spent.overflowXp;

  // Rest if exhausted
  const exhausted = newCurrent === 0 && newOverflow === 0;
  const restUntil = exhausted ? new Date(Date.now() + REST_DURATION_MS) : null;

  const durationMins = intensity === "HIGH" ? 45 : intensity === "LOW" ? 20 : 30;

  // Trainers at the player's gym earn a tier-scaled GYMFIT cut per player workout
  const trainers = gymMembership
    ? await prisma.gymMember.findMany({
        where: { gymId: gymMembership.gym.id, role: "TRAINER" },
        select: { userId: true },
      })
    : [];
  const payMicro = gymMembership ? trainerPayMicroForTier(gymMembership.gym.tier) : 0n;

  // Stat gains — in-game gym workouts are the main way stats climb toward the
  // next level's floor, so they have to be applied here too (not just in the
  // plan-based /api/game/workout route). Level-up is gated on stats AND XP.
  const statGain = character
    ? calculateStatGain(spec?.planType ?? "HYBRID", durationMins, intensity, 0.03)
    : null;

  const [updatedUser, updatedCharacter, workout] = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        currentXp:      newCurrent,
        overflowXp:     newOverflow,
        offChainTokens: user.offChainTokens + tokenBigInt,
        ...(restUntil ? { restUntil } : {}),
        lastXpRegenAt: new Date(),
      },
      select: {
        currentXp: true,
        overflowXp: true,
        offChainTokens: true,
        restUntil: true,
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

    const workout = await tx.workout.create({
      data: {
        userId,
        characterId:  character?.id,
        source:       "IN_GAME",
        durationMins,
        intensity:    intensity as "LOW" | "MEDIUM" | "HIGH",
        adherencePct: 100,
        xpEarned:       0, // workouts no longer earn XP, only spend it
        tokensEarned: tokenBigInt,
        fitnessBoost: 0.03,
      },
    });

    if (payMicro > 0n) {
      for (const trainer of trainers) {
        const t = await tx.user.findUnique({
          where: { id: trainer.userId },
          select: { trainerEarningsMicro: true, offChainTokens: true },
        });
        if (!t) continue;
        const newMicro = t.trainerEarningsMicro + payMicro;
        const wholeGymfit = newMicro / MICRO_PER_GYMFIT;
        await tx.user.update({
          where: { id: trainer.userId },
          data: {
            trainerEarningsMicro: newMicro % MICRO_PER_GYMFIT,
            offChainTokens: t.offChainTokens + wholeGymfit,
          },
        });
        if (wholeGymfit > 0n) {
          await tx.transaction.create({
            data: {
              userId: trainer.userId,
              type: "EARN",
              amount: wholeGymfit,
              balanceBefore: t.offChainTokens,
              balanceAfter: t.offChainTokens + wholeGymfit,
              description: "Trainer pay",
            },
          });
        }
      }
    }

    return [updatedUser, updatedCharacter, workout] as const;
  });

  return Response.json({
    success:     true,
    xpSpent:      xpSpend,
    tokensEarned: tokenBigInt.toString(),
    currentXp:   updatedUser.currentXp,
    overflowXp:  updatedUser.overflowXp,
    exhausted,
    restUntil:   updatedUser.restUntil?.toISOString() ?? null,
    workoutId:   workout.id,
    statGain,
    stats:       updatedCharacter,
    equipment: spec
      ? { type: spec.type, name: spec.name, grade: spec.grade, level: equipmentLevel }
      : null,
  });
}
