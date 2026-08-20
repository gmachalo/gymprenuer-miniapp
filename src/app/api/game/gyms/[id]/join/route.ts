import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { GYM_TIERS } from "../upgrade/route";

// POST /api/game/gyms/[id]/join
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: gymId } = await params;
  const userId = session.user.id;

  const [gym, user, existingMembership] = await Promise.all([
    prisma.gym.findUnique({ where: { id: gymId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.gymMember.findUnique({
      where: { gymId_userId: { gymId, userId } },
    }),
  ]);

  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (existingMembership)
    return Response.json({ error: "Already a member" }, { status: 409 });
  if (gym.memberCount >= gym.maxMembers)
    return Response.json({ error: "Gym is full" }, { status: 400 });

  // Join cost is tier-based: low tiers (1–3) cost XP only, high tiers (4–5) cost GYMFIT only
  const tierData = GYM_TIERS[gym.tier - 1] ?? GYM_TIERS[0];
  const joinCostXp = tierData.joinXp;
  const joinCostGymfit = BigInt(tierData.joinGymfit);
  const totalXp = user.currentXp + user.overflowXp;

  if (joinCostXp > 0 && totalXp < joinCostXp)
    return Response.json({ error: `Need ${joinCostXp} XP to join. You have ${totalXp}.` }, { status: 402 });
  if (joinCostGymfit > 0n && user.offChainTokens < joinCostGymfit)
    return Response.json({ error: `Need ${joinCostGymfit} GYMFIT to join` }, { status: 402 });

  // Deduct XP — overflow first, then current
  let newOverflow = user.overflowXp;
  let newCurrent = user.currentXp;
  if (joinCostXp > 0) {
    if (newOverflow >= joinCostXp) {
      newOverflow -= joinCostXp;
    } else {
      const remainder = joinCostXp - newOverflow;
      newOverflow = 0;
      newCurrent = Math.max(0, newCurrent - remainder);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.gymMember.create({ data: { gymId, userId, role: "MEMBER" } });
    await tx.gym.update({
      where: { id: gymId },
      data: { memberCount: { increment: 1 } },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        currentXp: newCurrent,
        overflowXp: newOverflow,
        offChainTokens: { decrement: joinCostGymfit },
      },
    });
    if (joinCostGymfit > 0n) {
      await tx.transaction.create({
        data: {
          userId,
          type: "GYM_FEE",
          amount: joinCostGymfit,
          balanceBefore: user.offChainTokens,
          balanceAfter: user.offChainTokens - joinCostGymfit,
          description: `Joined gym: ${gym.name}`,
        },
      });
    }
  });

  return Response.json({ success: true, gym });
}
