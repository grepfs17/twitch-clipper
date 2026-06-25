# Twitch Budget and KV Throttling

## The Problem

Twitch's Clips API allows about 800 requests per minute per client ID. The
app needs to fetch potentially thousands of clips during a single "Load all
clips" operation, spread across multiple concurrent windows. Without
careful management, we would hit the rate limit almost immediately.

## How It Works

There are three layers of protection, from the outermost (server) to the
innermost (client).

### Layer 1: Server-Side Budget Gate

Every request to `/api/clips` goes through `checkTwitchBudget()` before
hitting Twitch. This function reads a shared budget counter from Cloudflare
Workers KV (key: `twitch:budget`). If the remaining count is at or below 20,
the request is rejected with a 429 response and a retry-after hint.

This is the authoritative defense. Even if the client misbehaves, the server
won't let requests through when the budget is exhausted.

### Layer 2: KV Write Throttling

After each successful Twitch API call, the server updates the budget counter
via `writeTwitchBudget()`. During "Load all clips", this would normally
trigger a KV write on every single page fetch across all concurrent windows.
That's a lot of writes hitting Cloudflare KV in a short time.

To prevent this, writes are throttled. The in-memory budget value is always
updated immediately (so decisions within the same Worker isolate are
accurate), but the KV store is only updated when at least one of these
conditions is met:

- The remaining count dropped by 50 or more since the last write.
- The reset timestamp changed (meaning Twitch started a new rate-limit
  minute).
- At least 10 seconds have passed since the last write.

This reduces KV write volume while keeping the shared budget counter accurate enough for safe gating.

### Layer 3: Client Self-Throttling

The client reads the `X-Twitch-Ratelimit-Remaining` header from every
response and adjusts its request pacing accordingly:

| Remaining | Delay between pages |
|-----------|---------------------|
| > 200     | 100ms (default)     |
| 101-200   | 250ms               |
| 31-100    | 500ms               |
| <= 30     | 1500ms              |

If a 429 is received, the client waits for the `Retry-After` duration
before retrying. This means the client backs off before the server ever
has to reject a request.

## The "Load all clips" Flow

When the user clicks "Load all clips":

1. Time windows are built (30-day chunks going back to 2014).
2. Up to 3 windows are fetched concurrently via `asyncPool`.
3. Each window paginates through its time range, fetching 100 clips per
   page.
4. Each page fetch goes through the server-side budget gate, hits the
   Twitch API, and updates the budget counter.
5. The client self-throttles based on the remaining budget.
6. Failed windows (due to rate limits or errors) are re-queued and
   retried up to 3 times with a 15-second cooldown between attempts.
7. As clips arrive, they are appended to the grid and the category filter
   is updated.

## The Initial Search Flow

When the user searches for a channel with "all" time range selected:

1. Two fetches run in parallel:
   - Top 100 clips (unbounded fetch, Twitch returns by view count).
   - Latest 100 clips (from the last 30 days).
2. Results are merged and deduplicated by clip ID.
3. Remaining time windows are queued behind the "Load all clips" button.

For other time ranges (24h, 7d, 30d), only the first window is fetched
initially, with the rest queued.

## KV Namespaces

The app uses two Cloudflare KV namespaces:

- `RATE_LIMIT_KV` -- Stores the shared Twitch budget counter and per-IP
  rate limit counters for non-clips endpoints.
- `CLIP_CACHE_KV` -- Caches fetched clip pages to avoid re-fetching on
  subsequent searches for the same channel.

## Concurrency Tuning

The current concurrency is 3 simultaneous windows. This is a balance
between throughput and rate-limit headroom. Increasing it would cause the
self-throttle to kick in more aggressively and would increase KV
contention, often resulting in more total time due to retries rather than
less.
