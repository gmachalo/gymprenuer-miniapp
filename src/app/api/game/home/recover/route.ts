import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { HOME_RECOVERY_ITEMS, HomeRecoveryItemId, applyXpReward } from "@/lib/game/engine";

// POST /api/game/home/recover — interact with a HomeScene recovery prop
// (bed/chair/fridge) to add XP back to the pool, gated by a per-item cooldown.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const { item } = body as { item?: string };

  if (!item || !(item in HOME_RECOVERY_ITEMS))
    return Response.json({ error: "Unknown item" }, { status: 400 });
  const itemId = item as HomeRecoveryItemId;
  const config = HOME_RECOVERY_ITEMS[itemId];

  const [user, character] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { currentXp: true, overflowXp: true, homeRecoveryUsedAt: true },
    }),
    prisma.character.findFirst({
      where: { userId, isActive: true },
      select: { transformationStage: true },
    }),
  ]);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const usedAt = (user.homeRecoveryUsedAt as Record<string, string>) ?? {};
  const lastUsed = usedAt[itemId] ? new Date(usedAt[itemId]) : null;
  const now = new Date();

  if (lastUsed) {
    const elapsedMs = now.getTime() - lastUsed.getTime();
    if (elapsedMs < config.cooldownMs) {
      const remainingMs = config.cooldownMs - elapsedMs;
      return Response.json(
        {
          error: `${config.label} needs ${Math.ceil(remainingMs / 60_000)} more minute(s) before you can use it again.`,
          remainingMs,
        },
        { status: 429 }
      );
    }
  }

  const stage = character?.transformationStage ?? 0;
  const xpUpdate = applyXpReward(user.currentXp, user.overflowXp, config.xpGain, stage);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      currentXp: xpUpdate.currentXp,
      overflowXp: xpUpdate.overflowXp,
      homeRecoveryUsedAt: { ...usedAt, [itemId]: now.toISOString() },
    },
    select: { currentXp: true, overflowXp: true, restUntil: true },
  });

  // Clear rest if XP is available again
  if (updated.restUntil && updated.restUntil > now && xpUpdate.currentXp + xpUpdate.overflowXp > 0) {
    await prisma.user.update({ where: { id: userId }, data: { restUntil: null } });
    updated.restUntil = null;
  }

  return Response.json({
    success: true,
    item: itemId,
    xpGained: xpUpdate.xpAdded,
    currentXp: updated.currentXp,
    overflowXp: updated.overflowXp,
    restUntil: updated.restUntil?.toISOString() ?? null,
    cooldownMs: config.cooldownMs,
  });
}
