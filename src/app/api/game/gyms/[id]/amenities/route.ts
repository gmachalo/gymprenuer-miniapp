import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import {
  AMENITY_CATALOG,
  amenitiesAvailableForTier,
  amenityCapacity,
  amenityInstallBlocker,
  amenitySpec,
  standardAmenities,
} from "@/lib/game/engine";

// A gym's amenities: the standard fittings every gym has, plus whatever the
// owner has bought with GYMFIT. Higher tiers unlock better refreshments,
// lockers, and whole rooms — and hold more of them at once.

async function loadGym(gymId: string) {
  return prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      id: true,
      name: true,
      tier: true,
      ownerId: true,
      amenities: { select: { id: true, type: true, installedAt: true }, orderBy: { installedAt: "asc" } },
    },
  });
}

function describe(spec: ReturnType<typeof amenitySpec>) {
  if (!spec) return null;
  return {
    type: spec.type,
    name: spec.name,
    kind: spec.kind,
    icon: spec.icon,
    verb: spec.verb,
    xpGain: spec.xpGain,
    cooldownMins: Math.round(spec.cooldownMs / 60_000),
    minTier: spec.minTier,
    installCost: spec.installCost.toString(),
    reputation: spec.reputation,
    blurb: spec.blurb,
  };
}

// GET /api/game/gyms/[id]/amenities
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

  const installedTypes = new Set(gym.amenities.map((a) => a.type));
  const capacity = amenityCapacity(gym.tier, gym.amenities);

  return Response.json({
    gymId: gym.id,
    tier: gym.tier,
    isOwner: gym.ownerId === session.user.id,
    capacity,
    // Present in every gym, no row and no slot required.
    standard: standardAmenities().map(describe),
    installed: gym.amenities.flatMap((a) => {
      const spec = amenitySpec(a.type);
      return spec ? [{ id: a.id, ...describe(spec)! }] : [];
    }),
    available: amenitiesAvailableForTier(gym.tier)
      .filter((spec) => !installedTypes.has(spec.type))
      .map(describe),
    // Shown deliberately: the next tier's amenities are part of the pull to upgrade.
    lockedByTier: AMENITY_CATALOG.filter(
      (spec) => !spec.standard && spec.minTier > gym.tier
    ).map(describe),
  });
}

// POST /api/game/gyms/[id]/amenities { type } — install one with GYMFIT.
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
    return Response.json({ error: "Only the gym owner can install amenities" }, { status: 403 });

  const spec = amenitySpec(type);
  if (!spec) return Response.json({ error: `Unknown amenity ${type}` }, { status: 400 });

  const blocker = amenityInstallBlocker(spec, gym.tier, gym.amenities);
  if (blocker) {
    return Response.json({ error: blocker, minTier: spec.minTier }, { status: 409 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { offChainTokens: true },
  });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const cost = BigInt(spec.installCost);
  if (user.offChainTokens < cost) {
    return Response.json(
      {
        error: `Need ${cost} GYMFIT to install ${spec.name}. You have ${user.offChainTokens}.`,
        cost: cost.toString(),
      },
      { status: 402 }
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const amenity = await tx.gymAmenity.create({
      data: { gymId: gym.id, type: spec.type, installCost: cost },
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
        description: `Installed ${spec.name} at ${gym.name}`,
      },
    });

    // Amenities are what make a gym somewhere people want to be, so they pay
    // the owner back through reputation — which drives daily gym income.
    await tx.gym.update({
      where: { id: gym.id },
      data: { reputation: { increment: spec.reputation } },
    });

    return amenity;
  });

  return Response.json(
    {
      success: true,
      amenity: { id: created.id, ...describe(spec)! },
      spent: cost.toString(),
      balance: (user.offChainTokens - cost).toString(),
      capacity: amenityCapacity(gym.tier, [...gym.amenities, { type: spec.type }]),
    },
    { status: 201 }
  );
}
