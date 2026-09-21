import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { amenitySpec, applyXpReward } from "@/lib/game/engine";

// POST /api/game/gym/refresh — use an amenity at the gym the player trains at:
// a drink from the dispenser, a shower, a spell in the sauna. XP goes back into
// the pool, gated by a per-amenity cooldown. The mirror of
// /api/game/home/recover, which does the same for the home props.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { amenity } = (await req.json().catch(() => ({}))) as { amenity?: string };
  const spec = amenity ? amenitySpec(amenity) : null;
  if (!spec) return Response.json({ error: "Unknown amenity" }, { status: 400 });

  if (spec.xpGain <= 0) {
    return Response.json(
      { error: `${spec.name} is a facility, not something to use for XP.` },
      { status: 400 }
    );
  }

  const [user, character, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { currentXp: true, overflowXp: true, gymAmenityUsedAt: true },
    }),
    prisma.character.findFirst({
      where: { userId, isActive: true },
      select: { transformationStage: true },
    }),
    prisma.gymMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: "desc" },
      select: {
        gym: {
          select: { id: true, name: true, tier: true, amenities: { select: { type: true } } },
        },
      },
    }),
  ]);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (!membership)
    return Response.json({ error: "You are not a member of any gym" }, { status: 409 });

  const gym = membership.gym;

  // Standard fittings are in every gym; anything else has to have been bought.
  const present = spec.standard || gym.amenities.some((a) => a.type === spec.type);
  if (!present) {
    return Response.json(
      { error: `${gym.name} does not have a ${spec.name}.` },
      { status: 404 }
    );
  }
  if (spec.minTier > gym.tier) {
    return Response.json(
      { error: `${spec.name} needs a tier ${spec.minTier} gym.` },
      { status: 409 }
    );
  }

  const usedAt = (user.gymAmenityUsedAt as Record<string, string>) ?? {};
  const lastUsed = usedAt[spec.type] ? new Date(usedAt[spec.type]) : null;
  const now = new Date();

  if (lastUsed) {
    const elapsedMs = now.getTime() - lastUsed.getTime();
    if (elapsedMs < spec.cooldownMs) {
      const remainingMs = spec.cooldownMs - elapsedMs;
      return Response.json(
        {
          error: `${spec.name} needs ${Math.ceil(remainingMs / 60_000)} more minute(s).`,
          remainingMs,
        },
        { status: 429 }
      );
    }
  }

  const stage = character?.transformationStage ?? 0;
  const xpUpdate = applyXpReward(user.currentXp, user.overflowXp, spec.xpGain, stage);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      currentXp: xpUpdate.currentXp,
      overflowXp: xpUpdate.overflowXp,
      gymAmenityUsedAt: { ...usedAt, [spec.type]: now.toISOString() },
    },
    select: { currentXp: true, overflowXp: true, restUntil: true },
  });

  // Coming back with XP in hand ends a rest period, same as the home props.
  let restUntil = updated.restUntil;
  if (restUntil && restUntil > now && xpUpdate.currentXp + xpUpdate.overflowXp > 0) {
    await prisma.user.update({ where: { id: userId }, data: { restUntil: null } });
    restUntil = null;
  }

  return Response.json({
    success: true,
    amenity: spec.type,
    name: spec.name,
    xpGained: xpUpdate.xpAdded,
    currentXp: updated.currentXp,
    overflowXp: updated.overflowXp,
    restUntil: restUntil?.toISOString() ?? null,
    cooldownMs: spec.cooldownMs,
  });
}
