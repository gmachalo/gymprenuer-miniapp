import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { pullFromProvider } from "@/lib/fitness/sync";
import { statRequiredForLevel } from "@/lib/game/engine";

// POST /api/fitness/pull — pull new sessions from the linked workout app and
// convert them into character stats. This is how real training moves the
// level-up gate, which requires every stat to clear level × STAT_PER_LEVEL.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const result = await pullFromProvider(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { level: true },
    });

    const requiredStat = statRequiredForLevel(user?.level ?? 1);
    const stats = result.stats;

    return Response.json({
      ...result,
      requiredStat,
      // What the player still owes on each stat before the next level unlocks.
      remainingToLevel: stats
        ? {
            strength: Math.max(0, requiredStat - stats.strength),
            stamina: Math.max(0, requiredStat - stats.stamina),
            discipline: Math.max(0, requiredStat - stats.discipline),
            metabolism: Math.max(0, requiredStat - stats.metabolism),
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const status = message === "No workout app is linked" ? 409 : 502;
    return Response.json({ error: message }, { status });
  }
}

// GET /api/fitness/pull — recent imported sessions and what they were worth.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const workouts = await prisma.fitnessWorkout.findMany({
    where: { userId: session.user.id },
    orderBy: { performedAt: "desc" },
    take: 20,
    select: {
      id: true,
      provider: true,
      performedAt: true,
      durationMins: true,
      intensity: true,
      planType: true,
      counted: true,
      gainStrength: true,
      gainStamina: true,
      gainDiscipline: true,
      gainMetabolism: true,
    },
  });

  return Response.json({
    workouts: workouts.map((w) => ({
      ...w,
      performedAt: w.performedAt.toISOString(),
    })),
  });
}
