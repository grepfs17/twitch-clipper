# Twitch Budget and Rate Limiting

## The Problem

Twitch's Clips API allows about 800 requests per minute per client ID. The
app needs to fetch potentially thousands of clips during a single "Load all
clips" operation, spread across multiple concurrent windows. Without
careful management, we would hit the rate limit almost immediately.

## How It Works

### Layer 1: Server-Side Rate Limiting (in-memory, per-isolate)

A lightweight in-memory rate limiter (`checkRateLimit` in `src/lib/utils.ts:34`)
covers the auxiliary endpoints:

| Endpoint | Limit |
|----------|-------|
| `/api/clips/lookup` | 120 req/min |
| `/api/clips/formats` | 120 req/min |
| `/api/clips/download` | 60 req/min |

The `/api/clips` endpoint does **not** have server-side rate limiting.
Instead, it acts as a transparent proxy, forwarding Twitch's own rate-limit
response headers (`Ratelimit-Remaining`, `Ratelimit-Limit`, `Ratelimit-Reset`)
back to the client via `X-Twitch-Ratelimit-*` headers.

This means the primary budget enforcement is delegated to the client.

### Layer 2: Client Self-Throttling

The client reads the `X-Twitch-Ratelimit-Remaining` header from every
response and adjusts its request pacing accordingly:

| Remaining | Delay between pages |
|-----------|---------------------|
| > 200     | 100ms (default)     |
| 101-200   | 250ms               |
| 31-100    | 500ms               |
| <= 30     | 1500ms              |

When the `Ratelimit-Reset` timestamp is near (< 60s away), the client
stretches the delay to avoid crossing the reset boundary mid-fetch.

If a 429 is received (from either Twitch or the server), the client waits
for the `Retry-After` duration before retrying.

### Layer 3: All API Routes are Same-Origin Only

Every server-side route calls `isSameOrigin()` before processing. Requests
from other origins receive a 403. This prevents abuse from non-app sources
consuming the app's Twitch budget.

## The "Load all clips" Flow

When the user clicks "Load all clips":

1. Time windows are built (30-day chunks going back to 2014).
2. Up to 3 windows are fetched concurrently via `asyncPool`.
3. Each window paginates through its time range, fetching 100 clips per
   page.
4. Each page fetch goes through the server proxy directly to Twitch.
   Twitch's rate-limit headers are forwarded back to the client.
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

## Storage

There are no KV namespaces currently bound. All storage is client-side:

- **IndexedDB** — Full clip library cache per channel (`twitch-clip-explorer` /
  `channels` store). Supports save, load, clear, and incremental "Fetch New".
- **localStorage** — Favorites (`tc-favorites`), recent searches (`tc-recent`),
  and per-clip notes (`tc-notes`).
- **In-memory (server)** — Rate-limit counters per client IP, per Worker
  isolate. Ephemeral and not shared across isolates.

## Concurrency Tuning

The current concurrency is 3 simultaneous windows. This is a balance
between throughput and rate-limit headroom. Increasing it would cause the
self-throttle to kick in more aggressively and would increase KV
contention, often resulting in more total time due to retries rather than
less.
