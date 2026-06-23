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

export async function checkRateLimit(
  request: Request,
  env: { RATE_LIMIT_KV?: { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> } },
  { maxRequests = 30, windowSec = 60 } = {},
): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (import.meta.env.DEV) return { allowed: true };

  const kv = env.RATE_LIMIT_KV;
  if (!kv) return { allowed: true };

  const ip = getClientIp(request);
  const key = `rl:${ip}`;
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
