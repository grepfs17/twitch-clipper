export class ClipsFetchError extends Error {
  status: number;
  retryAfter: number | null;
  constructor(message: string, status: number, retryAfter: number | null) {
    super(message);
    this.name = "ClipsFetchError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface TwitchBudget {
  remaining: number | null;
  resetAt: number | null;
}

export function readTwitchBudget(headers: Headers): TwitchBudget {
  const remaining = headers.get("X-Twitch-Ratelimit-Remaining");
  const reset = headers.get("X-Twitch-Ratelimit-Reset");
  return {
    remaining: remaining != null ? Number(remaining) : null,
    resetAt: reset != null ? Number(reset) : null,
  };
}

export async function fetchClips(
  channel: string,
  timeRange = "all",
  after = "",
  startedAt?: string,
  endedAt?: string,
): Promise<{ body: any; budget: TwitchBudget; status: number }> {
  let url = `/api/clips?channel=${encodeURIComponent(channel)}&timeRange=${timeRange}&after=${after}`;
  if (startedAt) url += `&startedAt=${encodeURIComponent(startedAt)}`;
  if (endedAt) url += `&endedAt=${encodeURIComponent(endedAt)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const retryAfterRaw = res.headers.get("Retry-After");
    const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : null;
    let message = "Failed to fetch clips";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore body parse errors
    }
    throw new ClipsFetchError(message, res.status, retryAfter);
  }
  const body = await res.json();
  return { body, budget: readTwitchBudget(res.headers), status: res.status };
}
