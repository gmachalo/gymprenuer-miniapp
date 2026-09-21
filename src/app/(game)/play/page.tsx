import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { PlayClient } from "./PlayClient";
import { equipmentSpec, equipmentTokenYield } from "@/lib/game/engine";

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
      include: {
        gym: {
          select: {
            name: true,
            reputation: true,
            tier: true,
            equipment: {
              select: { id: true, type: true, name: true, level: true },
              orderBy: { purchasedAt: "asc" },
            },
            amenities: {
              select: { type: true },
              orderBy: { installedAt: "asc" },
            },
          },
        },
      },
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
        gymTier: gymMembership?.gym.tier ?? 1,
        // The gym scene renders the floor the gym has actually paid for.
        gymEquipment: (gymMembership?.gym.equipment ?? []).flatMap((e) => {
          const spec = equipmentSpec(e.type);
          if (!spec) return [];
          return [{
            id: e.id,
            type: e.type,
            name: e.name,
            level: e.level,
            grade: spec.grade,
            tokens: equipmentTokenYield(spec, e.level),
          }];
        }),
        // Standard fittings are implicit; these are what the owner has bought.
        gymAmenities: (gymMembership?.gym.amenities ?? []).map((a) => a.type),
      }}
      playerName={character.name}
      currentXp={user.currentXp}
      overflowXp={user.overflowXp}
      restUntil={user.restUntil?.toISOString() ?? null}
      lastXpRegenAt={user.lastXpRegenAt.toISOString()}
      offChainTokens={Number(user.offChainTokens)}
      level={user.level}
      characterStats={{
        strength: character.strength,
        stamina: character.stamina,
        discipline: character.discipline,
        metabolism: character.metabolism,
      }}
      streakCount={streak?.currentStreak ?? 0}
      gymName={gymMembership?.gym.name}
      hasGym={!!gymMembership}
    />
  );
}
