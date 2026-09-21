import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { startingStatsFor } from "@/lib/game/engine";

// GET /api/game/character — Get active character
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const character = await prisma.character.findFirst({
    where: { userId: session.user.id, isActive: true },
  });

  return Response.json({ character });
}

// POST /api/game/character — Create a character
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, bodyType, planTypes, workoutEnv } = body as {
    name: string;
    bodyType: "SKINNY" | "AVERAGE" | "OVERWEIGHT";
    planTypes?: string[];
    workoutEnv?: string | null;
  };

  if (!name || !bodyType)
    return Response.json({ error: "name and bodyType are required" }, { status: 400 });

  const validTypes = ["SKINNY", "AVERAGE", "OVERWEIGHT"];
  if (!validTypes.includes(bodyType))
    return Response.json({ error: "Invalid bodyType" }, { status: 400 });

  // Deactivate any existing characters
  await prisma.character.updateMany({
    where: { userId: session.user.id, isActive: true },
    data: { isActive: false },
  });

  // Opening stats come from every choice made at signup — body type, the goals
  // picked, and where the player trains — and all of them sit below the level-1
  // stat floor, so the first level-up has to be trained for.
  const stats = startingStatsFor({
    bodyType,
    planTypes: Array.isArray(planTypes) ? planTypes : [],
    workoutEnv: workoutEnv ?? null,
  });

  const character = await prisma.character.create({
    data: {
      userId: session.user.id,
      name,
      bodyType,
      ...stats,
      isActive: true,
    },
  });

  return Response.json({ character }, { status: 201 });
}
