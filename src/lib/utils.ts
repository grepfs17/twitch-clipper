import type { TwitchBudget } from "../scripts/types";

export type { TwitchBudget } from "../scripts/types";

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = new URL(request.url).host;
  if (origin) return new URL(origin).host === host;
  if (referer) return new URL(referer).host === host;
  return false;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

const TWITCH_BUDGET_KEY = "twitch:budget";
// Twitch's documented limit is 800 req/min per client_id. We start shedding
// load well before that to leave headroom for retries and other endpoints.
const TWITCH_BUDGET_FLOOR = 20;

// In-memory budget cache — avoids hammering KV on every request during
// bursty paginated fetches. The KV value is the source of truth for
// cross-isolate consistency, but we only write when the count drops
// meaningfully or the reset window changes.
let memBudget: TwitchBudget = { remaining: null, resetAt: null };
let lastKvWriteRemaining: number | null = null;
let lastKvWriteTime = 0;
const KV_WRITE_MIN_INTERVAL_MS = 10_000; // don't write more than once per 10s
const KV_WRITE_MIN_DELTA = 50; // only write when remaining drops by this much

export async function readTwitchBudget(env: {
  RATE_LIMIT_KV?: {
    get(key: string): Promise<string | null>;
    put(
      key: string,
      value: string,
      opts?: { expirationTtl?: number },
    ): Promise<void>;
  };
}): Promise<TwitchBudget> {
  // Prefer in-memory cache (more current during bursts)
  if (memBudget.remaining != null) return memBudget;

  const kv = env.RATE_LIMIT_KV;
  if (!kv) return { remaining: null, resetAt: null };
  const raw = await kv.get(TWITCH_BUDGET_KEY);
  if (!raw) return { remaining: null, resetAt: null };
  try {
    const parsed = JSON.parse(raw) as TwitchBudget;
    const budget = {
      remaining: typeof parsed.remaining === "number" ? parsed.remaining : null,
      resetAt: typeof parsed.resetAt === "number" ? parsed.resetAt : null,
    };
    memBudget = budget;
    return budget;
  } catch {
    return { remaining: null, resetAt: null };
  }
}

export async function writeTwitchBudget(
  env: {
    RATE_LIMIT_KV?: {
      get(key: string): Promise<string | null>;
      put(
        key: string,
        value: string,
        opts?: { expirationTtl?: number },
      ): Promise<void>;
    };
  },
  remaining: number | null,
  resetAt: number | null,
): Promise<void> {
  // Always update in-memory for immediate consistency within this isolate
  memBudget = { remaining, resetAt };

  const kv = env.RATE_LIMIT_KV;
  if (!kv) return;

  const now = Date.now();
  const remainingDelta =
    lastKvWriteRemaining != null && remaining != null
      ? lastKvWriteRemaining - remaining
      : Infinity;
  const resetChanged = resetAt !== memBudget.resetAt;
  const enoughTime = now - lastKvWriteTime >= KV_WRITE_MIN_INTERVAL_MS;

  // Only persist to KV when it matters
  if (remainingDelta >= KV_WRITE_MIN_DELTA || resetChanged || enoughTime) {
    lastKvWriteRemaining = remaining;
    lastKvWriteTime = now;
    await kv.put(
      TWITCH_BUDGET_KEY,
      JSON.stringify({ remaining, resetAt } satisfies TwitchBudget),
      { expirationTtl: 120 },
    );
  }
}

export async function checkTwitchBudget(env: {
  RATE_LIMIT_KV?: {
    get(key: string): Promise<string | null>;
    put(
      key: string,
      value: string,
      opts?: { expirationTtl?: number },
    ): Promise<void>;
  };
}): Promise<{
  allowed: boolean;
  retryAfter?: number;
  remaining: number | null;
}> {
  if (import.meta.env.DEV) return { allowed: true, remaining: null };
  const { remaining, resetAt } = await readTwitchBudget(env);
  if (remaining == null) return { allowed: true, remaining: null };
  if (remaining > TWITCH_BUDGET_FLOOR) return { allowed: true, remaining };
  const waitSec =
    resetAt != null ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : 5;
  return { allowed: false, retryAfter: waitSec, remaining };
}

export async function checkRateLimit(
  request: Request,
  env: {
    RATE_LIMIT_KV?: {
      get(key: string): Promise<string | null>;
      put(
        key: string,
        value: string,
        opts?: { expirationTtl?: number },
      ): Promise<void>;
    };
  },
  {
    maxRequests = 120,
    windowSec = 60,
    scope,
  }: { maxRequests?: number; windowSec?: number; scope?: string } = {},
): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (import.meta.env.DEV) return { allowed: true };

  const kv = env.RATE_LIMIT_KV;
  if (!kv) return { allowed: true };

  const ip = getClientIp(request);
  // Scope the counter by endpoint so a flood on /api/clips doesn't
  // starve unrelated endpoints (e.g. /api/clips/formats) of their
  // own per-IP budget.
  const key = scope ? `rl:${scope}:${ip}` : `rl:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSec;

  const raw = await kv.get(key);
  const timestamps: number[] = raw ? JSON.parse(raw) : [];
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    const retryAfter = oldest + windowSec - now;
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  recent.push(now);
  await kv.put(key, JSON.stringify(recent), { expirationTtl: windowSec * 2 });

  return { allowed: true };
}
