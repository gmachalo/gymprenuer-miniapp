import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { xpRequiredForLevel } from "@/lib/game/engine";

// POST /api/game/level-up — spend pool XP (currentXp + overflowXp) to advance a level
export async function POST() {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true, currentXp: true, overflowXp: true },
  });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const requiredXp = xpRequiredForLevel(user.level);
  const pool = user.currentXp + user.overflowXp;

  if (pool < requiredXp) {
    return Response.json(
      { error: `Need ${requiredXp} XP to reach level ${user.level + 1}. You have ${pool}.`, requiredXp, pool },
      { status: 402 }
    );
  }

  // Spend XP — overflow first, then current
  let newOverflow = user.overflowXp;
  let newCurrent = user.currentXp;
  if (newOverflow >= requiredXp) {
    newOverflow -= requiredXp;
  } else {
    const remainder = requiredXp - newOverflow;
    newOverflow = 0;
    newCurrent = Math.max(0, newCurrent - remainder);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      level: { increment: 1 },
      currentXp: newCurrent,
      overflowXp: newOverflow,
    },
    select: { level: true, currentXp: true, overflowXp: true },
  });

  return Response.json({
    success: true,
    level: updated.level,
    currentXp: updated.currentXp,
    overflowXp: updated.overflowXp,
    nextRequiredXp: xpRequiredForLevel(updated.level),
  });
}
