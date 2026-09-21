import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { equipmentGradeForGymTier, gymTierProgress } from "@/lib/game/engine";

// Gym tier config. Join costs stay XP-priced at the low tiers and GYMFIT-priced
// at the high ones; the tier upgrade itself is always paid in GYMFIT and is
// gated on the gym's equipment build-out (see gymTierRequirement in the engine).
export const GYM_TIERS = [
  { tier: 1, name: "Starter Den",      joinXp: 50,  buyXp: 500,  joinGymfit: 0,    monthlyFee: BigInt(50),   multiplier: 1.0 },
  { tier: 2, name: "Iron Pit",         joinXp: 150, buyXp: 2000, joinGymfit: 0,    monthlyFee: BigInt(120),  multiplier: 1.2 },
  { tier: 3, name: "Power House",      joinXp: 300, buyXp: 5000, joinGymfit: 0,    monthlyFee: BigInt(250),  multiplier: 1.5 },
  { tier: 4, name: "Elite Zone",       joinXp: 0,   buyXp: 0,    joinGymfit: 500,  monthlyFee: BigInt(800),  multiplier: 2.0 },
  { tier: 5, name: "Champion's Arena", joinXp: 0,   buyXp: 0,    joinGymfit: 2000, monthlyFee: BigInt(2500), multiplier: 3.0 },
];

// GET /api/game/gyms/[id]/upgrade — what the next tier needs and how close the gym is.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const gym = await prisma.gym.findUnique({
    where: { id },
    select: {
      id: true,
      tier: true,
      ownerId: true,
      equipment: { select: { type: true, level: true } },
    },
  });
  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });

  const progress = gymTierProgress(gym.tier, gym.equipment);
  return Response.json({
    tier: gym.tier,
    tierName: GYM_TIERS[gym.tier - 1]?.name ?? "Unknown",
    nextTierName: GYM_TIERS[gym.tier]?.name ?? null,
    equipmentGrade: equipmentGradeForGymTier(gym.tier),
    isOwner: gym.ownerId === session.user.id,
    ...progress,
    requirement: progress.requirement
      ? { ...progress.requirement, costGymfit: progress.requirement.costGymfit.toString() }
      : null,
  });
}

// POST /api/game/gyms/[id]/upgrade — advance a gym to the next tier.
// Two gates: the equipment build-out has to be done, and the owner pays GYMFIT.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  const gym = await prisma.gym.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      tier: true,
      name: true,
      equipment: { select: { type: true, level: true } },
    },
  });

  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });
  if (gym.ownerId !== userId)
    return Response.json({ error: "Only the gym owner can upgrade" }, { status: 403 });
  if (gym.tier >= 5)
    return Response.json({ error: "Gym is already at max tier" }, { status: 400 });

  const nextTierData = GYM_TIERS[gym.tier]; // 0-indexed, so this is tier + 1
  const progress = gymTierProgress(gym.tier, gym.equipment);
  const requirement = progress.requirement;
  if (!requirement)
    return Response.json({ error: "Gym is already at max tier" }, { status: 400 });

  // Gate 1 — the gym has to have been built out.
  if (!progress.eligible) {
    return Response.json(
      {
        error: `${gym.name} is not built out for tier ${requirement.tier} yet: needs ${progress.missing.join(", ")}.`,
        missing: progress.missing,
        requirement: { ...requirement, costGymfit: requirement.costGymfit.toString() },
        equipmentCount: progress.equipmentCount,
        totalEquipmentLevels: progress.totalEquipmentLevels,
      },
      { status: 409 }
    );
  }

  // Gate 2 — the owner pays for it in GYMFIT.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { offChainTokens: true },
  });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const cost = requirement.costGymfit;
  if (user.offChainTokens < cost) {
    return Response.json(
      {
        error: `Need ${cost} GYMFIT to reach tier ${requirement.tier}. You have ${user.offChainTokens}.`,
        cost: cost.toString(),
      },
      { status: 402 }
    );
  }

  const [updatedGym, updatedUser] = await prisma.$transaction([
    prisma.gym.update({
      where: { id },
      data: {
        tier: gym.tier + 1,
        monthlyFee: nextTierData.monthlyFee,
        reputation: { increment: 15 },
        metadata: { tier: gym.tier + 1, tierName: nextTierData.name },
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { offChainTokens: user.offChainTokens - cost },
      select: { offChainTokens: true },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: "SPEND",
        amount: cost,
        balanceBefore: user.offChainTokens,
        balanceAfter: user.offChainTokens - cost,
        description: `Upgraded ${gym.name} to tier ${gym.tier + 1} (${nextTierData.name})`,
      },
    }),
  ]);

  return Response.json({
    success: true,
    gym: { id: updatedGym.id, tier: updatedGym.tier, name: updatedGym.name },
    newTierName: nextTierData.name,
    // The payoff: the next grade of equipment is now buyable.
    equipmentGrade: equipmentGradeForGymTier(updatedGym.tier),
    spent: cost.toString(),
    user: { offChainTokens: updatedUser.offChainTokens.toString() },
  });
}
