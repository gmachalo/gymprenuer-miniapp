/**
 * Real-world fitness app providers.
 *
 * Each provider knows three things: how to send a player off to authorise the
 * link, how to turn the returned code into tokens, and how to list the workouts
 * the player has actually completed since a given watermark. Everything above
 * this file works against the normalised `ExternalWorkoutSummary` shape, so the
 * game never has to care which app the player trains with.
 *
 * Credentials come from env vars. A provider whose vars are unset reports
 * `configured: false` and is offered as unavailable rather than failing at the
 * OAuth redirect.
 */

import type { FitnessProvider } from "@prisma/client";
import type { ExternalWorkoutSummary } from "./adapter";
import { fetchMockWorkouts } from "./adapter";

export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string | null;
  externalUserId?: string | null;
}

export interface ProviderConnection {
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  externalUserId: string | null;
}

export interface ProviderDefinition {
  id: FitnessProvider;
  label: string;
  /** Shown in the connect UI so players know what the game will read. */
  blurb: string;
  icon: string;
  /** False when the deployment has no client credentials for this provider. */
  configured: boolean;
  /** True for providers that cannot be pulled and must push data to us instead. */
  pushOnly: boolean;
  authorizeUrl?(redirectUri: string, state: string): string;
  exchangeCode?(code: string, redirectUri: string): Promise<ProviderTokens>;
  refresh?(refreshToken: string): Promise<ProviderTokens>;
  fetchWorkouts(conn: ProviderConnection, since: Date | null): Promise<ExternalWorkoutSummary[]>;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const env = (k: string) => process.env[k]?.trim() || "";

/** Providers report activity types in their own vocabulary; map onto our plan types. */
export function mapPlanType(raw: string): string {
  const t = raw.toUpperCase();
  if (/(WEIGHT|STRENGTH|LIFT|CROSSFIT|POWER)/.test(t)) return "STRENGTH";
  if (/(RUN|RIDE|BIKE|CYCL|SWIM|ROW|CARDIO|WALK|HIKE|ELLIPTICAL)/.test(t)) return "FAT_LOSS";
  if (/(YOGA|PILATES|CALISTHENIC|BODYWEIGHT|GYMNASTIC|CLIMB)/.test(t)) return "CALISTHENICS";
  return "HYBRID";
}

/**
 * Intensity from whatever effort signal the provider exposes — heart rate is
 * the most honest, calories per minute the usual fallback, duration the floor.
 */
export function deriveIntensity(opts: {
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  durationMins: number;
  calories?: number | null;
}): "LOW" | "MEDIUM" | "HIGH" {
  const { avgHeartRate, maxHeartRate, durationMins, calories } = opts;

  if (avgHeartRate && maxHeartRate && maxHeartRate > 0) {
    const pct = avgHeartRate / maxHeartRate;
    if (pct >= 0.8) return "HIGH";
    if (pct >= 0.65) return "MEDIUM";
    return "LOW";
  }
  if (avgHeartRate) {
    if (avgHeartRate >= 150) return "HIGH";
    if (avgHeartRate >= 120) return "MEDIUM";
    return "LOW";
  }
  if (calories && durationMins > 0) {
    const perMin = calories / durationMins;
    if (perMin >= 10) return "HIGH";
    if (perMin >= 6) return "MEDIUM";
    return "LOW";
  }
  return durationMins >= 45 ? "MEDIUM" : "LOW";
}

async function providerFetch(url: string, accessToken: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Provider request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

function toIsoDate(value: string | number | Date): string {
  return new Date(value).toISOString().split("T")[0];
}

const THIRTY_DAYS_MS = 30 * 86_400_000;

// ─── Strava ──────────────────────────────────────────────────────────────────

const strava: ProviderDefinition = {
  id: "STRAVA",
  label: "Strava",
  blurb: "Reads your completed activities — type, duration and heart rate.",
  icon: "🏃",
  configured: !!(env("STRAVA_CLIENT_ID") && env("STRAVA_CLIENT_SECRET")),
  pushOnly: false,

  authorizeUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: env("STRAVA_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      approval_prompt: "auto",
      scope: "read,activity:read",
      state,
    });
    return `https://www.strava.com/oauth/authorize?${p}`;
  },

  async exchangeCode(code) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env("STRAVA_CLIENT_ID"),
        client_secret: env("STRAVA_CLIENT_SECRET"),
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error(`Strava token exchange failed (${res.status})`);
    const d = await res.json();
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? null,
      expiresAt: d.expires_at ? new Date(d.expires_at * 1000) : null,
      scope: d.scope ?? null,
      externalUserId: d.athlete?.id ? String(d.athlete.id) : null,
    };
  },

  async refresh(refreshToken) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env("STRAVA_CLIENT_ID"),
        client_secret: env("STRAVA_CLIENT_SECRET"),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`Strava token refresh failed (${res.status})`);
    const d = await res.json();
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? refreshToken,
      expiresAt: d.expires_at ? new Date(d.expires_at * 1000) : null,
    };
  },

  async fetchWorkouts(conn, since) {
    if (!conn.accessToken) return [];
    const after = Math.floor((since ?? new Date(Date.now() - THIRTY_DAYS_MS)).getTime() / 1000);
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`;
    const data = (await providerFetch(url, conn.accessToken)) as Array<{
      id: number;
      type?: string;
      sport_type?: string;
      start_date: string;
      moving_time?: number;
      elapsed_time?: number;
      average_heartrate?: number;
      max_heartrate?: number;
      calories?: number;
    }>;

    return data.map((a) => {
      const durationMins = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
      return {
        id: String(a.id),
        date: toIsoDate(a.start_date),
        durationMins,
        intensity: deriveIntensity({
          avgHeartRate: a.average_heartrate ?? null,
          maxHeartRate: a.max_heartrate ?? null,
          durationMins,
          calories: a.calories ?? null,
        }),
        // Strava has no notion of adherence to a plan — a logged activity is a
        // completed one, so it scores full marks and duration/intensity carry.
        adherencePct: 100,
        planType: mapPlanType(a.sport_type || a.type || ""),
      };
    });
  },
};

// ─── Fitbit ──────────────────────────────────────────────────────────────────

const fitbit: ProviderDefinition = {
  id: "FITBIT",
  label: "Fitbit",
  blurb: "Reads logged exercise sessions and their heart-rate averages.",
  icon: "⌚",
  configured: !!(env("FITBIT_CLIENT_ID") && env("FITBIT_CLIENT_SECRET")),
  pushOnly: false,

  authorizeUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: env("FITBIT_CLIENT_ID"),
      response_type: "code",
      scope: "activity heartrate profile",
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.fitbit.com/oauth2/authorize?${p}`;
  },

  async exchangeCode(code, redirectUri) {
    const basic = Buffer.from(
      `${env("FITBIT_CLIENT_ID")}:${env("FITBIT_CLIENT_SECRET")}`
    ).toString("base64");
    const res = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new Error(`Fitbit token exchange failed (${res.status})`);
    const d = await res.json();
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? null,
      expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null,
      scope: d.scope ?? null,
      externalUserId: d.user_id ?? null,
    };
  },

  async refresh(refreshToken) {
    const basic = Buffer.from(
      `${env("FITBIT_CLIENT_ID")}:${env("FITBIT_CLIENT_SECRET")}`
    ).toString("base64");
    const res = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error(`Fitbit token refresh failed (${res.status})`);
    const d = await res.json();
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? refreshToken,
      expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null,
    };
  },

  async fetchWorkouts(conn, since) {
    if (!conn.accessToken) return [];
    const afterDate = toIsoDate(since ?? new Date(Date.now() - THIRTY_DAYS_MS));
    const url =
      "https://api.fitbit.com/1/user/-/activities/list.json" +
      `?afterDate=${afterDate}&sort=asc&offset=0&limit=50`;
    const data = (await providerFetch(url, conn.accessToken)) as {
      activities?: Array<{
        logId: number;
        activityName?: string;
        startTime: string;
        duration?: number; // milliseconds
        averageHeartRate?: number;
        calories?: number;
      }>;
    };

    return (data.activities ?? []).map((a) => {
      const durationMins = Math.round((a.duration ?? 0) / 60_000);
      return {
        id: String(a.logId),
        date: toIsoDate(a.startTime),
        durationMins,
        intensity: deriveIntensity({
          avgHeartRate: a.averageHeartRate ?? null,
          durationMins,
          calories: a.calories ?? null,
        }),
        adherencePct: 100,
        planType: mapPlanType(a.activityName ?? ""),
      };
    });
  },
};

// ─── Google Fit ──────────────────────────────────────────────────────────────

// The activity codes worth distinguishing; anything else falls through
// mapPlanType to HYBRID.
const GOOGLE_FIT_ACTIVITY: Record<number, string> = {
  1: "BIKING",
  7: "WALKING",
  8: "RUNNING",
  82: "SWIMMING",
  97: "WEIGHT_TRAINING",
  100: "YOGA",
};

const googleFit: ProviderDefinition = {
  id: "GOOGLE_FIT",
  label: "Google Fit",
  blurb: "Reads the workout sessions recorded on your phone or watch.",
  icon: "🟢",
  configured: !!(env("GOOGLE_FIT_CLIENT_ID") && env("GOOGLE_FIT_CLIENT_SECRET")),
  pushOnly: false,

  authorizeUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: env("GOOGLE_FIT_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/fitness.activity.read",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("GOOGLE_FIT_CLIENT_ID"),
        client_secret: env("GOOGLE_FIT_CLIENT_SECRET"),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new Error(`Google Fit token exchange failed (${res.status})`);
    const d = await res.json();
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? null,
      expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null,
      scope: d.scope ?? null,
    };
  },

  async refresh(refreshToken) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("GOOGLE_FIT_CLIENT_ID"),
        client_secret: env("GOOGLE_FIT_CLIENT_SECRET"),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`Google Fit token refresh failed (${res.status})`);
    const d = await res.json();
    return {
      accessToken: d.access_token,
      refreshToken,
      expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null,
    };
  },

  async fetchWorkouts(conn, since) {
    if (!conn.accessToken) return [];
    const startTime = (since ?? new Date(Date.now() - THIRTY_DAYS_MS)).toISOString();
    const url =
      "https://www.googleapis.com/fitness/v1/users/me/sessions" +
      `?startTime=${startTime}&endTime=${new Date().toISOString()}`;
    const data = (await providerFetch(url, conn.accessToken)) as {
      session?: Array<{
        id: string;
        name?: string;
        activityType: number;
        startTimeMillis: string;
        endTimeMillis: string;
      }>;
    };

    return (data.session ?? []).map((s) => {
      const durationMins = Math.round(
        (Number(s.endTimeMillis) - Number(s.startTimeMillis)) / 60_000
      );
      return {
        id: s.id,
        date: toIsoDate(Number(s.startTimeMillis)),
        durationMins,
        // Sessions carry no heart rate inline, so duration is the only signal.
        intensity: deriveIntensity({ durationMins }),
        adherencePct: 100,
        planType: mapPlanType(s.name || GOOGLE_FIT_ACTIVITY[s.activityType] || ""),
      };
    });
  },
};

// ─── Apple Health ────────────────────────────────────────────────────────────
// Apple has no server-side API — HealthKit data lives on the device. The
// companion app pushes sessions to POST /api/fitness/ingest instead, so there
// is nothing to pull here.

const appleHealth: ProviderDefinition = {
  id: "APPLE_HEALTH",
  label: "Apple Health",
  blurb: "Workouts are pushed from your iPhone rather than pulled by the game.",
  icon: "🍎",
  configured: true,
  pushOnly: true,
  async fetchWorkouts() {
    return [];
  },
};

// ─── Mock (development) ──────────────────────────────────────────────────────

const mock: ProviderDefinition = {
  id: "MOCK",
  label: "Demo Tracker",
  blurb: "Deterministic sample data for trying the link without a real account.",
  icon: "🧪",
  configured: true,
  pushOnly: false,
  async fetchWorkouts(conn, since) {
    const daysBack = since
      ? Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86_400_000))
      : 7;
    return fetchMockWorkouts(conn.userId, Math.min(daysBack, 30));
  },
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const FITNESS_PROVIDERS: Record<FitnessProvider, ProviderDefinition> = {
  MOCK: mock,
  STRAVA: strava,
  FITBIT: fitbit,
  GOOGLE_FIT: googleFit,
  APPLE_HEALTH: appleHealth,
};

export function getProvider(id: string): ProviderDefinition | null {
  return (FITNESS_PROVIDERS as Record<string, ProviderDefinition>)[id.toUpperCase()] ?? null;
}

/** Absolute callback URL for a provider — must match what is registered with them. */
export function callbackUrlFor(provider: string): string {
  const base = env("NEXT_PUBLIC_APP_URL") || env("AUTH_URL") || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/fitness/callback/${provider.toLowerCase()}`;
}
