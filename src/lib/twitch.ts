import { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } from "astro:env/server";

// Token cache
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0; // unix ms

function getTwitchClientId(): string {
  if (!TWITCH_CLIENT_ID) {
    throw new Error("TWITCH_CLIENT_ID not set in environment variables");
  }
  return TWITCH_CLIENT_ID;
}

export async function getAccessToken() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error("Twitch credentials not found in environment variables");
  }

  // Return cached token if still valid (with 60s buffer)
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("Failed to get Twitch access token:", response.status, error);
    throw new Error(`Failed to get access token: ${JSON.stringify(error)}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };
  _cachedToken = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return _cachedToken!;
}

export async function getBroadcasterId(login: string, token: string) {
  const clientId = getTwitchClientId();

  const response = await fetch(
    `https://api.twitch.tv/helix/users?login=${login}`,
    {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("Failed to fetch user:", response.status, body);
    throw new Error("Failed to fetch user");
  }

  const data = (await response.json()) as { data: Array<{ id: string }> };
  if (data.data.length === 0) {
    return null;
  }

  return data.data[0].id;
}

export interface TwitchRateLimitInfo {
  remaining: number | null;
  limit: number | null;
  resetAt: number | null; // unix ms
}

export class TwitchError extends Error {
  status: number;
  retryAfter: number | null;
  rateLimit: TwitchRateLimitInfo;
  constructor(
    message: string,
    status: number,
    retryAfter: number | null,
    rateLimit: TwitchRateLimitInfo,
  ) {
    super(message);
    this.name = "TwitchError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.rateLimit = rateLimit;
  }
}

function parseRateLimitHeaders(headers: Headers): TwitchRateLimitInfo {
  const remaining = headers.get("Ratelimit-Remaining");
  const limit = headers.get("Ratelimit-Limit");
  const reset = headers.get("Ratelimit-Reset");
  return {
    remaining: remaining != null ? Number(remaining) : null,
    limit: limit != null ? Number(limit) : null,
    resetAt: reset != null ? Number(reset) * 1000 : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a Twitch Helix endpoint with automatic retry on 429 / 5xx.
 * Honors `Ratelimit-Reset` when present. Bounded retry budget so a
 * stuck request can't pin a Worker indefinitely.
 */
export async function twitchFetch(
  url: string,
  token: string,
  maxAttempts = 4,
  options: {
    onBudget?: (budget: TwitchRateLimitInfo) => void | Promise<void>;
  } = {},
): Promise<{ data: any; rateLimit: TwitchRateLimitInfo }> {
  const clientId = getTwitchClientId();
  let lastError: TwitchError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
      },
    });

    const rateLimit = parseRateLimitHeaders(response.headers);
    if (rateLimit.remaining != null || rateLimit.resetAt != null) {
      await options.onBudget?.(rateLimit);
    }

    if (response.ok) {
      const data = await response.json();
      return { data, rateLimit };
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const headerResetMs = rateLimit.resetAt
      ? Math.max(0, rateLimit.resetAt - Date.now())
      : null;
    const retryAfterSec = retryAfterHeader
      ? Number(retryAfterHeader)
      : headerResetMs != null
        ? Math.ceil(headerResetMs / 1000)
        : null;

    // 429 or 5xx: retry with backoff
    if (response.status === 429 || response.status >= 500) {
      const backoff = Math.min(
        1000 * 2 ** attempt + Math.floor(Math.random() * 250),
        10_000,
      );
      const wait = retryAfterSec != null ? retryAfterSec * 1000 : backoff;
      await sleep(Math.max(backoff, wait));
      lastError = new TwitchError(
        `Twitch ${response.status}`,
        response.status,
        retryAfterSec,
        rateLimit,
      );
      continue;
    }

    // Other client errors: don't retry
    throw new TwitchError(
      `Twitch request failed: ${response.status}`,
      response.status,
      retryAfterSec,
      rateLimit,
    );
  }

  throw (
    lastError ??
    new TwitchError("Twitch request failed after retries", 429, null, {
      remaining: null,
      limit: null,
      resetAt: null,
    })
  );
}

export async function getClips(
  broadcasterId: string,
  token: string,
  options: {
    started_at?: string;
    ended_at?: string;
    first?: number;
    after?: string;
    onBudget?: (budget: TwitchRateLimitInfo) => void | Promise<void>;
  } = {},
) {
  const url = new URL("https://api.twitch.tv/helix/clips");

  url.searchParams.append("broadcaster_id", broadcasterId);
  if (options.started_at)
    url.searchParams.append("started_at", options.started_at);
  if (options.ended_at) url.searchParams.append("ended_at", options.ended_at);
  if (options.first) url.searchParams.append("first", options.first.toString());
  if (options.after) url.searchParams.append("after", options.after);

  const { data, rateLimit } = await twitchFetch(url.toString(), token, 4, {
    onBudget: options.onBudget,
  });

  return {
    data: data.data as Array<{ game_id: string; [k: string]: unknown }>,
    pagination: data.pagination as { cursor?: string },
    rateLimit,
  };
}

export async function getGames(
  gameIds: string[],
  token: string,
  options: {
    onBudget?: (budget: TwitchRateLimitInfo) => void | Promise<void>;
  } = {},
) {
  if (gameIds.length === 0) return [];

  const url = new URL("https://api.twitch.tv/helix/games");

  // Twitch allows up to 100 IDs per request
  gameIds.forEach((id) => url.searchParams.append("id", id));

  const { data } = await twitchFetch(url.toString(), token, 4, {
    onBudget: options.onBudget,
  });
  return data.data as Array<{ id: string; name: string }>;
}
