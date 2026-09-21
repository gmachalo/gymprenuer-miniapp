import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { statRequiredForLevel, xpRequiredForLevel, spendXp, calculateTransformationStage } from "@/lib/game/engine";

const STAT_KEYS = ["strength", "stamina", "discipline", "metabolism"] as const;

// POST /api/game/level-up — advance a level. Eligibility is stats-only (every
// Character stat must independently clear that level's floor), but the level-up
// itself still spends XP from the pool as the cost of the push.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const [user, character] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { level: true, currentXp: true, overflowXp: true },
    }),
    prisma.character.findFirst({
      where: { userId, isActive: true },
      select: { id: true, strength: true, stamina: true, discipline: true, metabolism: true },
    }),
  ]);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (!character) return Response.json({ error: "No character found" }, { status: 404 });

  const requiredStat = statRequiredForLevel(user.level);
  const shortStats = STAT_KEYS.filter((k) => character[k] < requiredStat);

  if (shortStats.length > 0) {
    return Response.json(
      {
        error: `Need at least ${requiredStat} ${shortStats.join("/")} to reach level ${user.level + 1}.`,
        requiredStat,
        shortStats,
      },
      { status: 402 }
    );
  }

  const requiredXp = xpRequiredForLevel(user.level);
  const pool = user.currentXp + user.overflowXp;

  if (pool < requiredXp) {
    return Response.json(
      { error: `Need ${requiredXp} XP to reach level ${user.level + 1}. You have ${pool}.`, requiredXp, pool },
      { status: 402 }
    );
  }

  const spent = spendXp(user.currentXp, user.overflowXp, requiredXp);
  const newLevel = user.level + 1;
  const newStage = calculateTransformationStage(newLevel);

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        level: newLevel,
        currentXp: spent.currentXp,
        overflowXp: spent.overflowXp,
        lastXpRegenAt: new Date(),
      },
      select: { level: true, currentXp: true, overflowXp: true },
    }),
    prisma.character.update({
      where: { id: character.id },
      data: { transformationStage: newStage },
    }),
  ]);

  return Response.json({
    success: true,
    level: updatedUser.level,
    currentXp: updatedUser.currentXp,
    overflowXp: updatedUser.overflowXp,
    xpSpent: requiredXp,
    transformationStage: newStage,
  });
}
