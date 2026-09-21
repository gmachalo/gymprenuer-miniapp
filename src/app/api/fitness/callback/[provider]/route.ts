import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getProvider, callbackUrlFor } from "@/lib/fitness/providers";
import { decodeState } from "@/lib/fitness/state";

const RETURN_TO = "/profile";

function back(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL(RETURN_TO, req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

// GET /api/fitness/callback/[provider] — OAuth redirect target.
// The signed `state` is what authenticates the user here, since the provider
// sends the browser back on a fresh request.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: slug } = await params;
  const definition = getProvider(slug);
  if (!definition?.exchangeCode) {
    return back(req, { fitness: "error", reason: "unknown_provider" });
  }

  const denied = req.nextUrl.searchParams.get("error");
  if (denied) return back(req, { fitness: "error", reason: denied });

  const code = req.nextUrl.searchParams.get("code");
  const state = decodeState(req.nextUrl.searchParams.get("state"));
  if (!code) return back(req, { fitness: "error", reason: "missing_code" });
  if (!state || state.provider !== definition.id) {
    return back(req, { fitness: "error", reason: "invalid_state" });
  }

  try {
    const tokens = await definition.exchangeCode(code, callbackUrlFor(definition.id));

    await prisma.fitnessConnection.upsert({
      where: { userId_provider: { userId: state.userId, provider: definition.id } },
      create: {
        userId: state.userId,
        provider: definition.id,
        externalUserId: tokens.externalUserId ?? null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        expiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope ?? null,
        active: true,
      },
      update: {
        externalUserId: tokens.externalUserId ?? null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        expiresAt: tokens.expiresAt ?? null,
        scope: tokens.scope ?? null,
        active: true,
        lastError: null,
      },
    });

    // One app at a time — a new link retires the previous one.
    await prisma.fitnessConnection.updateMany({
      where: { userId: state.userId, provider: { not: definition.id } },
      data: { active: false },
    });

    return back(req, { fitness: "linked", provider: definition.id });
  } catch (err) {
    console.error("[fitness/callback] token exchange failed:", err);
    return back(req, { fitness: "error", reason: "exchange_failed" });
  }
}
