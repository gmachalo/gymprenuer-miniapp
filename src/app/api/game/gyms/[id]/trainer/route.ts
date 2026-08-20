import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { trainerLevelRequirement } from "@/lib/game/engine";

// POST /api/game/gyms/[id]/trainer — apply to become a trainer at this gym
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: gymId } = await params;
  const userId = session.user.id;

  const [gym, user, membership] = await Promise.all([
    prisma.gym.findUnique({ where: { id: gymId }, select: { id: true, tier: true, name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { level: true } }),
    prisma.gymMember.findUnique({ where: { gymId_userId: { gymId, userId } } }),
  ]);

  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (!membership) return Response.json({ error: "Join this gym before applying as a trainer" }, { status: 403 });
  if (membership.role === "TRAINER")
    return Response.json({ error: "Already a trainer here" }, { status: 409 });

  const requiredLevel = trainerLevelRequirement(gym.tier);
  if (user.level < requiredLevel)
    return Response.json(
      { error: `Need level ${requiredLevel} to train at ${gym.name}. You are level ${user.level}.` },
      { status: 402 }
    );

  const updated = await prisma.gymMember.update({
    where: { gymId_userId: { gymId, userId } },
    data: { role: "TRAINER" },
  });

  return Response.json({ success: true, role: updated.role });
}
