import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { GYM_TIERS } from "@/app/api/game/gyms/[id]/upgrade/route";

// GET /api/game/gyms — list all gyms
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // 'SYSTEM' | 'PLAYER'

  const gyms = await prisma.gym.findMany({
    where: type ? { type: type as "SYSTEM" | "PLAYER" } : undefined,
    include: {
      _count: { select: { members: true } },
      owner: { select: { displayName: true, name: true } },
    },
    orderBy: { reputation: "desc" },
  });

  return Response.json({ gyms });
}

// POST /api/game/gyms — create a player gym
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const { name, description, monthlyFee } = body as {
    name: string;
    description?: string;
    monthlyFee?: number;
  };

  if (!name || name.trim().length < 3)
    return Response.json({ error: "Gym name must be at least 3 characters" }, { status: 400 });

  // New gyms start at tier 1 — creation costs that tier's buy-XP (a token sink,
  // matching the XP-only join model tier 1–3 gyms already use).
  const GYM_CREATION_COST_XP = GYM_TIERS[0].buyXp;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const totalXp = user.currentXp + user.overflowXp;
  if (totalXp < GYM_CREATION_COST_XP)
    return Response.json(
      { error: `Need ${GYM_CREATION_COST_XP} XP to create a gym. You have ${totalXp}.` },
      { status: 402 }
    );

  // Check they don't already own a gym
  const existing = await prisma.gym.findFirst({ where: { ownerId: userId } });
  if (existing)
    return Response.json({ error: "You already own a gym" }, { status: 409 });

  // Spend XP — overflow first, then current
  let newOverflow = user.overflowXp;
  let newCurrent = user.currentXp;
  if (newOverflow >= GYM_CREATION_COST_XP) {
    newOverflow -= GYM_CREATION_COST_XP;
  } else {
    const remainder = GYM_CREATION_COST_XP - newOverflow;
    newOverflow = 0;
    newCurrent = Math.max(0, newCurrent - remainder);
  }

  const gym = await prisma.$transaction(async (tx) => {
    const g = await tx.gym.create({
      data: {
        name: name.trim(),
        description,
        type: "PLAYER",
        ownerId: userId,
        monthlyFee: monthlyFee ? BigInt(monthlyFee) : BigInt(100),
      },
    });

    // Auto-join as owner
    await tx.gymMember.create({
      data: { gymId: g.id, userId, role: "CO_OWNER" },
    });

    // Deduct XP (sink!)
    await tx.user.update({
      where: { id: userId },
      data: { currentXp: newCurrent, overflowXp: newOverflow },
    });

    return g;
  });

  return Response.json({ gym }, { status: 201 });
}
