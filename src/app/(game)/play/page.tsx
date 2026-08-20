import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { PlayClient } from "./PlayClient";

export default async function PlayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  const [user, character, streak, gymMembership] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.character.findFirst({ where: { userId, isActive: true } }),
    prisma.streak.findUnique({ where: { userId } }),
    prisma.gymMember.findFirst({
      where: { userId },
      include: { gym: { select: { name: true, reputation: true } } },
      orderBy: { joinedAt: "desc" },
    }),
  ]);

  if (!user) redirect("/login");
  if (!user.onboardingDone) redirect("/onboarding");
  if (!character) redirect("/onboarding");

  return (
    <PlayClient
      initData={{
        playerBodyType: character.bodyType as "SKINNY" | "AVERAGE" | "OVERWEIGHT",
        playerName: character.name,
        playerTransformationStage: character.transformationStage,
        currentXp: user.currentXp,
        overflowXp: user.overflowXp,
        gymReputation: gymMembership?.gym.reputation ?? 30,
      }}
      playerName={character.name}
      currentXp={user.currentXp}
      overflowXp={user.overflowXp}
      restUntil={user.restUntil?.toISOString() ?? null}
      lastXpRegenAt={user.lastXpRegenAt.toISOString()}
      offChainTokens={Number(user.offChainTokens)}
      level={user.level}
      streakCount={streak?.currentStreak ?? 0}
      gymName={gymMembership?.gym.name}
      hasGym={!!gymMembership}
    />
  );
}
