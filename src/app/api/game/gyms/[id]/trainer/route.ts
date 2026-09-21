import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { trainerLevelRequirement, trainerActivationXpCost, spendXp, PRO_STAGE, STAGE_LABELS } from "@/lib/game/engine";

// POST /api/game/gyms/[id]/trainer — activate trainer mode at this gym.
// Requires reaching "Pro" (the Advanced transformation stage) regardless of
// gym tier, plus a level that's the stricter of a flat floor and the tier's
// own scaling (see trainerLevelRequirement), and spends a one-time XP cost
// to actually activate once eligible.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: gymId } = await params;
  const userId = session.user.id;

  const [gym, user, membership, character] = await Promise.all([
    prisma.gym.findUnique({ where: { id: gymId }, select: { id: true, tier: true, name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { level: true, currentXp: true, overflowXp: true } }),
    prisma.gymMember.findUnique({ where: { gymId_userId: { gymId, userId } } }),
    prisma.character.findFirst({ where: { userId, isActive: true }, select: { transformationStage: true } }),
  ]);

  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (!character) return Response.json({ error: "No character found" }, { status: 404 });
  if (!membership) return Response.json({ error: "Join this gym before applying as a trainer" }, { status: 403 });
  if (membership.role === "TRAINER")
    return Response.json({ error: "Already a trainer here" }, { status: 409 });

  const requiredLevel = trainerLevelRequirement(gym.tier);
  if (user.level < requiredLevel)
    return Response.json(
      { error: `Need level ${requiredLevel} to train at ${gym.name}. You are level ${user.level}.` },
      { status: 402 }
    );

  if (character.transformationStage < PRO_STAGE)
    return Response.json(
      {
        error: `Need to reach Pro (Advanced stage) to train at ${gym.name}. You are ${STAGE_LABELS[character.transformationStage]}.`,
      },
      { status: 402 }
    );

  const activationCost = trainerActivationXpCost(gym.tier);
  const pool = user.currentXp + user.overflowXp;
  if (pool < activationCost)
    return Response.json(
      { error: `Need ${activationCost} XP to activate trainer mode at ${gym.name}. You have ${pool}.`, activationCost, pool },
      { status: 402 }
    );

  const spent = spendXp(user.currentXp, user.overflowXp, activationCost);

  const [, updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        currentXp: spent.currentXp,
        overflowXp: spent.overflowXp,
        lastXpRegenAt: new Date(),
      },
    }),
    prisma.gymMember.update({
      where: { gymId_userId: { gymId, userId } },
      data: { role: "TRAINER" },
    }),
  ]);

  return Response.json({
    success: true,
    role: updated.role,
    xpSpent: activationCost,
    currentXp: spent.currentXp,
    overflowXp: spent.overflowXp,
  });
}
