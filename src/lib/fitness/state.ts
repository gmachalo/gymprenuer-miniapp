/**
 * Signed OAuth `state` for fitness provider links.
 *
 * The callback arrives on a fresh request, so it has to prove on its own that
 * the link it is completing is the one this user started. The state carries the
 * user id and provider under an HMAC keyed by AUTH_SECRET, and expires quickly.
 */

import { createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 10 * 60_000;

interface StatePayload {
  userId: string;
  provider: string;
  iat: number;
}

function key(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to link a fitness provider");
  return secret;
}

function sign(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function encodeState(userId: string, provider: string): string {
  const body = Buffer.from(
    JSON.stringify({ userId, provider, iat: Date.now() } satisfies StatePayload)
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns the payload, or null when the state is forged, malformed or stale. */
export function decodeState(state: string | null): StatePayload | null {
  if (!state) return null;
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;

  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as StatePayload;
    if (!payload.userId || Date.now() - payload.iat > TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
