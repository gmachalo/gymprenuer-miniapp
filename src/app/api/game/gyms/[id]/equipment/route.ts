import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  equipmentAvailableForTier,
  equipmentGradeForGymTier,
  equipmentSpec,
  equipmentTokenYield,
  equipmentUpgradeCost,
  gymTierProgress,
  MAX_EQUIPMENT_LEVEL,
} from "@/lib/game/engine";

// The floor a gym's equipment is measured against, and what an owner can buy or
// upgrade with the GYMFIT they have earned. Buying and upgrading is what moves a
// gym toward its next tier (see ../upgrade).

async function loadGym(gymId: string) {
  return prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      id: true,
      name: true,
      tier: true,
      ownerId: true,
      equipment: {
        select: { id: true, type: true, name: true, level: true, capacity: true },
        orderBy: { purchasedAt: "asc" },
      },
    },
  });
}

// GET /api/game/gyms/[id]/equipment — what the gym has, what it can still buy,
// and what stays locked until it tiers up.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const gym = await loadGym(id);
  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });

  const maxGrade = equipmentGradeForGymTier(gym.tier);
  const owned = new Set(gym.equipment.map((e) => e.type));

  return Response.json({
    gymId: gym.id,
    tier: gym.tier,
    maxGrade,
    isOwner: gym.ownerId === session.user.id,
    owned: gym.equipment.map((e) => {
      const spec = equipmentSpec(e.type);
      return {
        id: e.id,
        type: e.type,
        name: e.name,
        icon: spec?.icon ?? "🏋️",
        level: e.level,
        capacity: e.capacity,
        grade: spec?.grade ?? 0,
        tokenYield: spec ? equipmentTokenYield(spec, e.level) : 0,
        upgradeCost: spec ? equipmentUpgradeCost(spec, e.level)?.toString() ?? null : null,
        maxed: e.level >= MAX_EQUIPMENT_LEVEL,
      };
    }),
    available: equipmentAvailableForTier(gym.tier)
      .filter((spec) => !owned.has(spec.type))
      .map((spec) => ({
        type: spec.type,
        name: spec.name,
        icon: spec.icon,
        grade: spec.grade,
        intensity: spec.intensity,
        planType: spec.planType,
        purchaseCost: spec.purchaseCost.toString(),
        tokenYield: equipmentTokenYield(spec, 1),
      })),
    // Kept visible on purpose: seeing the next grade is the pull to tier up.
    lockedByTier: equipmentAvailableForTier(5)
      .filter((spec) => spec.grade > maxGrade)
      .map((spec) => ({
        type: spec.type,
        name: spec.name,
        grade: spec.grade,
        requiresGymTier: spec.grade - 1,
        purchaseCost: spec.purchaseCost.toString(),
      })),
    tierProgress: gymTierProgress(gym.tier, gym.equipment),
  });
}

// POST /api/game/gyms/[id]/equipment { type } — buy a new piece with GYMFIT.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const { type } = (await req.json().catch(() => ({}))) as { type?: string };
  if (!type) return Response.json({ error: "type is required" }, { status: 400 });

  const gym = await loadGym(id);
  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });
  if (gym.ownerId !== userId)
    return Response.json({ error: "Only the gym owner can buy equipment" }, { status: 403 });

  const spec = equipmentSpec(type);
  if (!spec) return Response.json({ error: `Unknown equipment ${type}` }, { status: 400 });

  const maxGrade = equipmentGradeForGymTier(gym.tier);
  if (spec.grade > maxGrade) {
    return Response.json(
      {
        error: `${spec.name} is grade ${spec.grade} — a tier ${spec.grade - 1} gym is needed to host it.`,
        requiresGymTier: spec.grade - 1,
      },
      { status: 403 }
    );
  }
  if (spec.purchaseCost <= 0) {
    return Response.json(
      { error: `${spec.name} is home equipment and cannot be installed in a gym.` },
      { status: 400 }
    );
  }
  if (gym.equipment.some((e) => e.type === type)) {
    return Response.json({ error: `${spec.name} is already on the floor` }, { status: 409 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { offChainTokens: true },
  });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const cost = BigInt(spec.purchaseCost);
  if (user.offChainTokens < cost) {
    return Response.json(
      {
        error: `Need ${cost} GYMFIT to buy ${spec.name}. You have ${user.offChainTokens}.`,
        cost: cost.toString(),
      },
      { status: 402 }
    );
  }

  const equipment = await prisma.$transaction(async (tx) => {
    const created = await tx.equipment.create({
      data: {
        gymId: gym.id,
        name: spec.name,
        type: spec.type,
        level: 1,
        purchaseCost: cost,
        upgradeCost: equipmentUpgradeCost(spec, 1),
        capacity: spec.capacity,
        statBonus: { planType: spec.planType, intensity: spec.intensity, grade: spec.grade },
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { offChainTokens: user.offChainTokens - cost },
    });

    await tx.transaction.create({
      data: {
        userId,
        type: "EQUIPMENT_BUY",
        amount: cost,
        balanceBefore: user.offChainTokens,
        balanceAfter: user.offChainTokens - cost,
        description: `Bought ${spec.name} for ${gym.name}`,
      },
    });

    // A better-equipped gym is a more attractive one.
    await tx.gym.update({
      where: { id: gym.id },
      data: { reputation: { increment: spec.grade } },
    });

    return created;
  });

  const equipmentAfter = [...gym.equipment, { type: spec.type, level: 1 }];

  return Response.json(
    {
      success: true,
      equipment: {
        id: equipment.id,
        type: spec.type,
        name: spec.name,
        level: 1,
        grade: spec.grade,
        tokenYield: equipmentTokenYield(spec, 1),
      },
      spent: cost.toString(),
      balance: (user.offChainTokens - cost).toString(),
      tierProgress: gymTierProgress(gym.tier, equipmentAfter),
    },
    { status: 201 }
  );
}

// PATCH /api/game/gyms/[id]/equipment { equipmentId } — upgrade a piece with GYMFIT.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const { equipmentId } = (await req.json().catch(() => ({}))) as { equipmentId?: string };
  if (!equipmentId)
    return Response.json({ error: "equipmentId is required" }, { status: 400 });

  const gym = await loadGym(id);
  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });
  if (gym.ownerId !== userId)
    return Response.json({ error: "Only the gym owner can upgrade equipment" }, { status: 403 });

  const current = gym.equipment.find((e) => e.id === equipmentId);
  if (!current)
    return Response.json({ error: "That equipment is not in this gym" }, { status: 404 });

  const spec = equipmentSpec(current.type);
  if (!spec)
    return Response.json({ error: `Unknown equipment ${current.type}` }, { status: 400 });

  const cost = equipmentUpgradeCost(spec, current.level);
  if (cost === null) {
    return Response.json(
      { error: `${spec.name} is already at max level (${MAX_EQUIPMENT_LEVEL})` },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { offChainTokens: true },
  });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  if (user.offChainTokens < cost) {
    return Response.json(
      {
        error: `Need ${cost} GYMFIT to upgrade ${spec.name}. You have ${user.offChainTokens}.`,
        cost: cost.toString(),
      },
      { status: 402 }
    );
  }

  const nextLevel = current.level + 1;

  const updated = await prisma.$transaction(async (tx) => {
    const eq = await tx.equipment.update({
      where: { id: equipmentId },
      data: { level: nextLevel, upgradeCost: equipmentUpgradeCost(spec, nextLevel) },
      select: { id: true, level: true },
    });

    await tx.user.update({
      where: { id: userId },
      data: { offChainTokens: user.offChainTokens - cost },
    });

    await tx.transaction.create({
      data: {
        userId,
        type: "EQUIPMENT_BUY",
        amount: cost,
        balanceBefore: user.offChainTokens,
        balanceAfter: user.offChainTokens - cost,
        description: `Upgraded ${spec.name} to Lv.${nextLevel} at ${gym.name}`,
      },
    });

    await tx.gym.update({
      where: { id: gym.id },
      data: { reputation: { increment: 2 } },
    });

    return eq;
  });

  const equipmentAfter = gym.equipment.map((e) =>
    e.id === equipmentId ? { type: e.type, level: nextLevel } : { type: e.type, level: e.level }
  );

  return Response.json({
    success: true,
    equipment: {
      id: updated.id,
      type: spec.type,
      name: spec.name,
      level: updated.level,
      grade: spec.grade,
      tokenYield: equipmentTokenYield(spec, updated.level),
      upgradeCost: equipmentUpgradeCost(spec, updated.level)?.toString() ?? null,
    },
    spent: cost.toString(),
    balance: (user.offChainTokens - cost).toString(),
    tierProgress: gymTierProgress(gym.tier, equipmentAfter),
  });
}
