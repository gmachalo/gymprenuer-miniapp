import { NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * Auth.js builds every sign-in and callback URL, and the post-login redirect,
 * from `req.url`. The Next dev server fills that in from its own origin
 * (`http://localhost:3000`), whatever address the browser actually used, so a
 * phone on the LAN that signed in at http://10.x.x.x:3000 was redirected to
 * `localhost` — its own loopback — and failed with "refused to connect".
 *
 * When the deployment trusts the Host header (AUTH_TRUST_HOST=true) and no
 * AUTH_URL is pinned, rebuild the request on the host it really arrived on.
 * This mirrors what next-auth itself does when AUTH_URL *is* set
 * (`reqWithEnvURL`). With AUTH_URL set, as in production, it is a no-op and
 * next-auth's own override applies.
 */
function onArrivalHost(req: NextRequest): NextRequest {
  if (process.env.AUTH_URL || process.env.NEXTAUTH_URL) return req;
  if (process.env.AUTH_TRUST_HOST !== "true") return req;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return req;
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol).replace(/:$/, "");

  const { href, origin } = req.nextUrl;
  const arrival = `${proto}://${host}`;
  return arrival === origin ? req : new NextRequest(href.replace(origin, arrival), req);
}

export const GET = (req: NextRequest) => handlers.GET(onArrivalHost(req));
export const POST = (req: NextRequest) => handlers.POST(onArrivalHost(req));
