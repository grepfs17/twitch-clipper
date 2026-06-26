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

// In-memory rate limiter (per Worker isolate). Good enough for the
// low-volume lookup/formats/download endpoints. Not cross-isolate
// consistent, but that's acceptable for abuse prevention.
const rateLimitStore = new Map<string, number[]>();

export function checkRateLimit(
  request: Request,
  _env?: unknown,
  {
    maxRequests = 120,
    windowSec = 60,
    scope,
  }: { maxRequests?: number; windowSec?: number; scope?: string } = {},
): { allowed: boolean; retryAfter?: number } {
  if (import.meta.env.DEV) return { allowed: true };

  const ip = getClientIp(request);
  const key = scope ? `rl:${scope}:${ip}` : `rl:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSec;

  const timestamps = rateLimitStore.get(key) || [];
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    const retryAfter = oldest + windowSec - now;
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  recent.push(now);
  rateLimitStore.set(key, recent);

  // Periodic cleanup to prevent unbounded growth
  if (recent.length === 1) {
    setTimeout(
      () => {
        const current = rateLimitStore.get(key) || [];
        const cleaned = current.filter((t) => t > now - windowSec * 2);
        if (cleaned.length === 0) rateLimitStore.delete(key);
        else rateLimitStore.set(key, cleaned);
      },
      windowSec * 2 * 1000,
    );
  }

  return { allowed: true };
}
