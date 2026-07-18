import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { applyXpReward } from "@/lib/game/engine";

// PATCH /api/game/xp/regen — calculate and apply XP regeneration
// Rate: 1 XP per 2 minutes, capped at 100 for currentXp
export async function PATCH(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        currentXp: true,
        overflowXp: true,
        lastXpRegenAt: true,
        restUntil: true,
      },
    });

    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    const now = new Date();
    const minutesSinceRegen =
      (now.getTime() - user.lastXpRegenAt.getTime()) / 60_000;

    // 1 XP per 2 minutes
    const xpToAdd = Math.floor(minutesSinceRegen / 2);

    if (xpToAdd === 0) {
      // Nothing to add yet — return current state
      return Response.json({
        currentXp: user.currentXp,
        overflowXp: user.overflowXp,
        restUntil: user.restUntil?.toISOString() ?? null,
        xpAdded: 0,
      });
    }

    const xpUpdate = applyXpReward(user.currentXp, user.overflowXp, xpToAdd);
    const newCurrentXp = xpUpdate.currentXp;
    const newOverflowXp = xpUpdate.overflowXp;
    const xpAdded = xpUpdate.xpAdded;

    if (xpAdded === 0) {
      return Response.json({
        currentXp: user.currentXp,
        overflowXp: user.overflowXp,
        restUntil: user.restUntil?.toISOString() ?? null,
        xpAdded: 0,
      });
    }

    // Clear rest if we have XP again
    const wasResting = user.restUntil && user.restUntil > now;
    const clearRest = newCurrentXp > 0 && wasResting ? { restUntil: null } : {};

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        currentXp: newCurrentXp,
        overflowXp: newOverflowXp,
        lastXpRegenAt: now,
        ...clearRest,
      },
      select: { currentXp: true, overflowXp: true, restUntil: true },
    });

    return Response.json({
      currentXp: updated.currentXp,
      overflowXp: updated.overflowXp,
      restUntil: updated.restUntil?.toISOString() ?? null,
      xpAdded,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P1001" || code === "ETIMEDOUT") {
      console.warn("[xp/regen] Database unreachable, returning 503:", code);
      return Response.json(
        { error: "Database temporarily unreachable", retryAfter: 5 },
        { status: 503 }
      );
    }
    throw err;
  }
}

// GET /api/game/xp/regen — get current XP state without modifying
export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        currentXp: true,
        overflowXp: true,
        lastXpRegenAt: true,
        restUntil: true,
      },
    });

    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    return Response.json({
      currentXp: user.currentXp,
      overflowXp: user.overflowXp,
      lastXpRegenAt: user.lastXpRegenAt.toISOString(),
      restUntil: user.restUntil?.toISOString() ?? null,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P1001" || code === "ETIMEDOUT") {
      console.warn("[xp/regen GET] Database unreachable, returning 503:", code);
      return Response.json(
        { error: "Database temporarily unreachable", retryAfter: 5 },
        { status: 503 }
      );
    }
    throw err;
  }
}
