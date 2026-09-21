import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { importWorkouts } from "@/lib/fitness/sync";
import { mapPlanType, deriveIntensity } from "@/lib/fitness/providers";
import { statRequiredForLevel } from "@/lib/game/engine";
import type { ExternalWorkoutSummary } from "@/lib/fitness/adapter";

// Apple Health (and any other on-device source) cannot be pulled — a companion
// app posts finished sessions here instead. Everything downstream is identical
// to a pull, including dedupe by external id and the daily stat cap.

const SessionSchema = z.object({
  externalId: z.string().min(1).max(200),
  performedAt: z.iso.datetime().or(z.string().min(8)),
  durationMins: z.number().int().min(0).max(600),
  activityType: z.string().max(100).optional(),
  intensity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  avgHeartRate: z.number().min(0).max(260).optional(),
  maxHeartRate: z.number().min(0).max(260).optional(),
  calories: z.number().min(0).max(20000).optional(),
  adherencePct: z.number().min(0).max(100).optional(),
});

const BodySchema = z.object({
  provider: z.enum(["APPLE_HEALTH", "MOCK", "STRAVA", "FITBIT", "GOOGLE_FIT"]).default("APPLE_HEALTH"),
  sessions: z.array(SessionSchema).min(1).max(50),
});

// POST /api/fitness/ingest — push finished real-world sessions into the game.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }
  const { provider, sessions } = parsed.data;

  // Only a linked provider may push — otherwise this endpoint is a free stat tap.
  const link = await prisma.fitnessConnection.findFirst({
    where: { userId, provider, active: true },
    select: { id: true },
  });
  if (!link) {
    return Response.json(
      { error: `${provider} is not linked to this account` },
      { status: 409 }
    );
  }

  const normalised: ExternalWorkoutSummary[] = sessions.map((s) => ({
    id: s.externalId,
    date: new Date(s.performedAt).toISOString().split("T")[0],
    durationMins: s.durationMins,
    intensity:
      s.intensity ??
      deriveIntensity({
        avgHeartRate: s.avgHeartRate ?? null,
        maxHeartRate: s.maxHeartRate ?? null,
        durationMins: s.durationMins,
        calories: s.calories ?? null,
      }),
    adherencePct: s.adherencePct ?? 100,
    planType: mapPlanType(s.activityType ?? ""),
  }));

  const result = await importWorkouts(userId, provider, normalised);

  await prisma.fitnessConnection.update({
    where: { id: link.id },
    data: { lastSyncedAt: new Date(), lastError: null },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } });

  return Response.json({
    provider,
    pulled: normalised.length,
    ...result,
    requiredStat: statRequiredForLevel(user?.level ?? 1),
  });
}
