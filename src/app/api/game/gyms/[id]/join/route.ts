import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { GYM_TIERS } from "../upgrade/route";
import { equipmentGradeForGymTier, gymJoinLevelRequirement, spendXp } from "@/lib/game/engine";

// POST /api/game/gyms/[id]/join
// Players train at one gym at a time, and may move between them freely: joining
// a new gym leaves the old one automatically. What gates the move is the gym's
// tier — its level requirement and its join cost — because the tier is what
// decides the grade of equipment on the floor.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: gymId } = await params;
  const userId = session.user.id;

  const [gym, user, existingMembership, otherMemberships] = await Promise.all([
    prisma.gym.findUnique({ where: { id: gymId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.gymMember.findUnique({ where: { gymId_userId: { gymId, userId } } }),
    prisma.gymMember.findMany({
      where: { gymId: { not: gymId }, userId },
      select: { id: true, gymId: true, gym: { select: { name: true, ownerId: true } } },
    }),
  ]);

  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (existingMembership)
    return Response.json({ error: "Already a member" }, { status: 409 });
  if (gym.memberCount >= gym.maxMembers)
    return Response.json({ error: "Gym is full" }, { status: 400 });

  // A gym you own is your home base — switching away from it would orphan it.
  const ownedElsewhere = otherMemberships.find((m) => m.gym.ownerId === userId);
  if (ownedElsewhere) {
    return Response.json(
      { error: `You own ${ownedElsewhere.gym.name} and train there. Transfer or close it first.` },
      { status: 409 }
    );
  }

  const requiredLevel = gymJoinLevelRequirement(gym.tier);
  if (user.level < requiredLevel) {
    return Response.json(
      {
        error: `Tier ${gym.tier} gyms need level ${requiredLevel}. You are level ${user.level}.`,
        requiredLevel,
      },
      { status: 403 }
    );
  }

  // Join cost is tier-based: low tiers (1–3) cost XP only, high tiers (4–5) cost GYMFIT only
  const tierData = GYM_TIERS[gym.tier - 1] ?? GYM_TIERS[0];
  const joinCostXp = tierData.joinXp;
  const joinCostGymfit = BigInt(tierData.joinGymfit);
  const totalXp = user.currentXp + user.overflowXp;

  if (joinCostXp > 0 && totalXp < joinCostXp)
    return Response.json({ error: `Need ${joinCostXp} XP to join. You have ${totalXp}.` }, { status: 402 });
  if (joinCostGymfit > 0n && user.offChainTokens < joinCostGymfit)
    return Response.json({ error: `Need ${joinCostGymfit} GYMFIT to join` }, { status: 402 });

  const spent = spendXp(user.currentXp, user.overflowXp, joinCostXp);

  const left = otherMemberships.map((m) => m.gym.name);

  await prisma.$transaction(async (tx) => {
    // Leave whatever gym they were training at — one membership at a time.
    if (otherMemberships.length > 0) {
      await tx.gymMember.deleteMany({
        where: { id: { in: otherMemberships.map((m) => m.id) } },
      });
      for (const m of otherMemberships) {
        await tx.gym.update({
          where: { id: m.gymId },
          data: { memberCount: { decrement: 1 } },
        });
      }
    }

    await tx.gymMember.create({ data: { gymId, userId, role: "MEMBER" } });
    await tx.gym.update({
      where: { id: gymId },
      data: { memberCount: { increment: 1 } },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        currentXp: spent.currentXp,
        overflowXp: spent.overflowXp,
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

  return Response.json({
    success: true,
    gym,
    // What this membership actually buys: the grade of gear on the floor.
    equipmentGrade: equipmentGradeForGymTier(gym.tier),
    leftGyms: left,
  });
}

// DELETE /api/game/gyms/[id]/join — leave a gym and drop back to training at home.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: gymId } = await params;
  const userId = session.user.id;

  const [gym, membership] = await Promise.all([
    prisma.gym.findUnique({ where: { id: gymId }, select: { id: true, name: true, ownerId: true } }),
    prisma.gymMember.findUnique({ where: { gymId_userId: { gymId, userId } } }),
  ]);

  if (!gym) return Response.json({ error: "Gym not found" }, { status: 404 });
  if (!membership) return Response.json({ error: "Not a member of this gym" }, { status: 409 });
  if (gym.ownerId === userId)
    return Response.json({ error: "You cannot leave a gym you own" }, { status: 403 });

  await prisma.$transaction([
    prisma.gymMember.delete({ where: { id: membership.id } }),
    prisma.gym.update({ where: { id: gymId }, data: { memberCount: { decrement: 1 } } }),
  ]);

  // Join fees are not refunded — leaving is free, rejoining costs again.
  return Response.json({ success: true, left: gym.name });
}
