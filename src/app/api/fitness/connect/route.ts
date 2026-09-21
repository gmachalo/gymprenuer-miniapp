import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { FITNESS_PROVIDERS, getProvider, callbackUrlFor } from "@/lib/fitness/providers";
import { encodeState } from "@/lib/fitness/state";

// GET /api/fitness/connect — which workout apps can be linked, and what is linked now.
// Tokens never leave the server.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const link = await prisma.fitnessConnection.findFirst({
    where: { userId: session.user.id, active: true },
    orderBy: { connectedAt: "desc" },
    select: {
      provider: true,
      externalUserId: true,
      connectedAt: true,
      lastSyncedAt: true,
      lastError: true,
    },
  });

  return Response.json({
    providers: Object.values(FITNESS_PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      blurb: p.blurb,
      icon: p.icon,
      configured: p.configured,
      pushOnly: p.pushOnly,
    })),
    connection: link
      ? {
          provider: link.provider,
          connectedAt: link.connectedAt.toISOString(),
          lastSyncedAt: link.lastSyncedAt?.toISOString() ?? null,
          lastError: link.lastError,
        }
      : null,
  });
}

// POST /api/fitness/connect { provider } — begin a link.
// OAuth providers get an authorize URL to redirect to; the demo tracker and
// push-only providers (Apple Health) are linked outright.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { provider: raw } = (await req.json().catch(() => ({}))) as { provider?: string };
  if (!raw) return Response.json({ error: "provider is required" }, { status: 400 });

  const definition = getProvider(raw);
  if (!definition) return Response.json({ error: `Unknown provider ${raw}` }, { status: 400 });
  if (!definition.configured)
    return Response.json(
      { error: `${definition.label} is not configured on this deployment.` },
      { status: 503 }
    );

  // Providers without an OAuth handshake are linked immediately.
  if (!definition.authorizeUrl || !definition.exchangeCode) {
    await prisma.fitnessConnection.upsert({
      where: { userId_provider: { userId, provider: definition.id } },
      create: { userId, provider: definition.id, active: true },
      update: { active: true, lastError: null },
    });
    // One app at a time — linking a new one retires the previous link.
    await prisma.fitnessConnection.updateMany({
      where: { userId, provider: { not: definition.id } },
      data: { active: false },
    });
    return Response.json({ connected: true, provider: definition.id });
  }

  const redirectUri = callbackUrlFor(definition.id);
  return Response.json({
    connected: false,
    provider: definition.id,
    authorizeUrl: definition.authorizeUrl(redirectUri, encodeState(userId, definition.id)),
  });
}

// DELETE /api/fitness/connect — unlink. Imported workouts and the stats they
// already awarded are kept; only the link and its tokens go.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.fitnessConnection.updateMany({
    where: { userId: session.user.id, active: true },
    data: { active: false, accessToken: null, refreshToken: null, expiresAt: null },
  });

  return Response.json({ disconnected: true });
}
