import { elements } from "./dom";
import {
  allClips,
  setAllClips,
  setDisplayedClips,
  appendClips,
  applyFilters,
  renderClips,
} from "./clips";
import { fetchClips, ClipsFetchError } from "./api";
import { updateCategories, selectCategory } from "./categories";
import { addRecent } from "./recent";
import { loadCache, saveCache, clearCache } from "./cache";
import { terminalConfirm, terminalToast, rateLimitToast } from "./notify";

// Time window helpers

interface TimeWindow {
  startedAt: string;
  endedAt: string;
}

/**
 * Build non-overlapping time windows walking backwards from now.
 *
 *   24h  → 1 window of 24h
 *   7d   → 1 window of 7d
 *   30d  → 6 × 5-day windows
 *   all  → 30-day windows back to 2014-01-01 (~134 windows)
 *
 * NOTE: for "all", these windows are only used by "Load all clips".
 * The initial search uses an unbounded fetch so Twitch returns clips
 * sorted by view count (most popular first).
 */
function buildWindows(range: string): TimeWindow[] {
  const now = new Date();

  if (range === "24h") {
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return [{ startedAt: start.toISOString(), endedAt: now.toISOString() }];
  }

  if (range === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return [{ startedAt: start.toISOString(), endedAt: now.toISOString() }];
  }

  if (range === "30d") {
    const chunkMs = 5 * 24 * 60 * 60 * 1000;
    const windows: TimeWindow[] = [];
    let end = new Date(now);
    for (let i = 0; i < 6; i++) {
      const start = new Date(end.getTime() - chunkMs);
      windows.push({
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
      });
      end = new Date(start);
    }
    return windows;
  }

  // "all" → 30-day windows back to 2014 (full Twitch history)
  const chunkMs = 30 * 24 * 60 * 60 * 1000;
  const earliest = new Date("2014-01-01T00:00:00Z");
  const windows: TimeWindow[] = [];
  let end = new Date(now);
  while (end > earliest) {
    const startMs = Math.max(end.getTime() - chunkMs, earliest.getTime());
    const start = new Date(startMs);
    windows.push({
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
    });
    end = new Date(start);
  }
  return windows;
}

function showCacheIndicator(savedAt: string) {
  if (!elements.cacheIndicator || !elements.cacheText) return;

  const date = new Date(savedAt);
  const age = Math.round((Date.now() - date.getTime()) / 1000 / 60);
  const ageLabel =
    age < 60
      ? `${age}m ago`
      : age < 1440
        ? `${Math.round(age / 60)}h ago`
        : `${Math.round(age / 1440)}d ago`;

  const formatted = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  elements.cacheText.textContent = `Loaded from cache (${allClips.length.toLocaleString()} clips, saved ${ageLabel} — ${formatted})`;
  elements.cacheIndicator.classList.remove("hidden");
}

function hideCacheIndicator() {
  elements.cacheIndicator?.classList.add("hidden");
}

let pendingWindows: TimeWindow[] = [];
let currentChannel = "";

function syncLoadAllBtn() {
  if (!elements.loadOlderBtn) return;
  if (pendingWindows.length > 0) {
    elements.loadOlderBtn.classList.remove("hidden");
    elements.loadOlderBtn.textContent = "Load all clips";
  } else {
    elements.loadOlderBtn.classList.add("hidden");
  }
}

/** Paginate through one bounded time window. Self-throttles when Twitch's
 *  remaining-budget response header drops near zero. */
async function fetchWindow(
  channel: string,
  range: string,
  win: TimeWindow,
  onProgress?: (n: number) => void,
  pageDelay = 100,
  pageCap: number | null = null,
): Promise<{ clips: any[]; failed: boolean; reason?: string }> {
  const maxClips = pageCap ?? parseInt(import.meta.env.PUBLIC_MAX_CLIPS || "50000", 10);
  const result: any[] = [];
  let cursor = "";
  let failed = false;
  let failReason: string | undefined;

  while (true) {
    let data: any;
    let budget: { remaining: number | null; resetAt: number | null };
    try {
      const res = await fetchClips(
        channel,
        range,
        cursor,
        win.startedAt,
        win.endedAt,
      );
      data = res.body;
      budget = res.budget;
    } catch (err) {
      if (err instanceof ClipsFetchError) {
        if (err.status === 429) {
          const wait = (err.retryAfter ?? 5) * 1000;
          const message =
            err.source === "twitch"
              ? `Twitch rate limit hit, waiting ${Math.ceil(wait / 1000)}s…`
              : err.source === "twitch-budget"
                ? `Server is pacing requests to Twitch, waiting ${Math.ceil(wait / 1000)}s…`
                : err.source === "kv"
                  ? `Local rate limit hit, waiting ${Math.ceil(wait / 1000)}s…`
                  : `Rate limit hit, waiting ${Math.ceil(wait / 1000)}s…`;
          rateLimitToast(message);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        // For non-429 errors, only show a toast once per window to avoid
        // spamming the user during multi-page pagination.
        terminalToast(`Clips fetch failed: ${err.message}`);
        failed = true;
        failReason = err.message;
      } else {
        failed = true;
        failReason = err instanceof Error ? err.message : String(err);
      }
      break;
    }
    if (!data || !data.clips || data.clips.length === 0) break;

    result.push(...data.clips);
    cursor = data.pagination?.cursor || "";
    onProgress?.(result.length);

    if (!cursor || result.length >= maxClips) break;

    // Self-throttle: stretch the inter-page delay when the Twitch budget
    // is getting low so the parallel windows don't all hammer at once.
    // Use gentler thresholds than the server-side Twitch-budget gate
    // (which sheds at remaining <= 20) so the client backs off before
    // the server ever has to refuse the request.
    let delay = pageDelay;
    if (budget.remaining != null) {
      if (budget.remaining <= 30) delay = Math.max(delay, 1500);
      else if (budget.remaining <= 100) delay = Math.max(delay, 500);
      else if (budget.remaining <= 200) delay = Math.max(delay, 250);
    }
    if (budget.resetAt != null) {
      const msUntilReset = budget.resetAt - Date.now();
      if (msUntilReset > 0 && msUntilReset < 60_000) {
        delay = Math.max(delay, Math.min(msUntilReset + 500, 60_000));
      }
    }
    await new Promise((r) => setTimeout(r, delay));
  }

  return { clips: result, failed, reason: failReason };
}

/**
 * Unbounded paginated fetch — Twitch returns clips sorted by view count
 * when no date range is given. Used for the initial "all" search so the
 * user immediately sees the most popular clips.
 */
async function fetchTopClips(
  channel: string,
  onProgress?: (n: number) => void,
  pageCap: number | null = null,
): Promise<{ clips: any[]; failed: boolean; reason?: string }> {
  return fetchWindow(
    channel,
    "all",
    { startedAt: "", endedAt: "" },
    onProgress,
    100,
    pageCap,
  );
}

// Concurrency helper

async function asyncPool<T>(
  concurrency: number,
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  onItemComplete?: () => void,
): Promise<void> {
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await fn(items[index], index);
      onItemComplete?.();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
}

// Load all clips

async function loadAllClips() {
  if (!currentChannel || pendingWindows.length === 0) return;

  setLoadOlderButton("Loading…", true);
  showLoader("Preparing to load all clips…");

  const els = getLoadAllProgressElements();
  els.progressArea?.classList.remove("hidden");
  if (els.progressBar) els.progressBar.style.width = "0%";

  const range = elements.rangeFilter?.value || "all";
  const MAX_AUTO_RETRIES = 3;
  const RETRY_COOLDOWN_MS = 15_000;

  let attempt = 0;
  let totalNewClips: any[] = [];
  let lastFailedCount = 0;

  while (true) {
    if (pendingWindows.length === 0) break;

    if (attempt > 0) {
      // Auto-retry: wait for the Twitch rate-limit window to clear, then
      // try the failed windows again silently.
      terminalToast(
        `Retrying ${pendingWindows.length} failed window${pendingWindows.length > 1 ? "s" : ""} in ${RETRY_COOLDOWN_MS / 1000}s…`,
        4000,
      );
      await new Promise((r) => setTimeout(r, RETRY_COOLDOWN_MS));
    }

    if (els.progressBar) els.progressBar.style.width = "0%";
    if (els.progressLabel)
      els.progressLabel.textContent = attempt === 0
        ? "Loading all clips…"
        : `Retrying ${pendingWindows.length} window${pendingWindows.length > 1 ? "s" : ""} (attempt ${attempt + 1}/${MAX_AUTO_RETRIES + 1})…`;

    const { clips, failedWindows } = await runLoadAllWindowPool(range, els);
    totalNewClips.push(...clips);
    lastFailedCount = failedWindows.length;

    // Successful clips from this attempt are appended immediately so
    // the user sees them in the grid as soon as they're fetched.
    if (clips.length > 0) {
      appendClips(clips);
      updateCategories();
      applyFilters();
    }

    if (failedWindows.length === 0) break; // all done
    if (attempt >= MAX_AUTO_RETRIES) break; // exhausted retries
    attempt++;
  }

  finalizeLoadAll(
    totalNewClips,
    lastFailedCount,
    pendingWindows.length,
    els,
  );
  await saveAndAnnounceCache(currentChannel);
  setTimeout(() => els.progressArea?.classList.add("hidden"), 2000);
}

function setLoadOlderButton(text: string, disabled: boolean) {
  if (elements.loadOlderBtn) {
    elements.loadOlderBtn.disabled = disabled;
    elements.loadOlderBtn.textContent = text;
  }
}

function showLoader(text: string) {
  if (elements.loader) elements.loader.classList.remove("hidden");
  if (elements.loaderText) elements.loaderText.textContent = text;
}

interface LoadAllProgressEls {
  progressArea: HTMLElement | null;
  progressBar: HTMLElement | null;
  progressLabel: HTMLElement | null;
  progressStats: HTMLElement | null;
}

function getLoadAllProgressElements(): LoadAllProgressEls {
  return {
    progressArea: document.getElementById("progressArea"),
    progressBar: document.getElementById("progressBar"),
    progressLabel: document.getElementById("progressLabel"),
    progressStats: document.getElementById("progressStats"),
  };
}

async function runLoadAllWindowPool(
  range: string,
  els: LoadAllProgressEls,
): Promise<{ clips: any[]; failedWindows: TimeWindow[] }> {
  const backgroundClips: any[] = [];
  const failedWindows: TimeWindow[] = [];
  const totalClipsBefore = allClips.length;
  const totalWindows = pendingWindows.length;
  const startTime = Date.now();
  let windowsProcessed = 0;

  const updateProgress = () => {
    const pct = Math.round((windowsProcessed / totalWindows) * 100);
    if (els.progressBar) els.progressBar.style.width = `${Math.min(pct, 100)}%`;
    if (els.progressLabel)
      els.progressLabel.textContent = `[${windowsProcessed}/${totalWindows}] ${pct}%`;
    if (els.progressStats) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const left = totalWindows - windowsProcessed;
      els.progressStats.textContent = formatEta(elapsed, left, windowsProcessed);
    }
    if (elements.loaderText) {
      elements.loaderText.textContent = `Loading window ${windowsProcessed}/${totalWindows} — ${(totalClipsBefore + backgroundClips.length).toLocaleString()} clips`;
    }
  };

  const windows = [...pendingWindows];
  pendingWindows.length = 0;

  await asyncPool(
    3,
    windows,
    async (win) => {
      const { clips, failed } = await fetchWindow(currentChannel, range, win);
      if (clips.length > 0) backgroundClips.push(...clips);
      if (failed) {
        // Re-queue the window in pendingWindows for the auto-retry loop
        // (or for a manual click if the user gives up waiting).
        failedWindows.push(win);
      }
    },
    () => {
      windowsProcessed++;
      updateProgress();
    },
  );

  // Re-queue any failed windows so a subsequent "Load all clips" can
  // try them again.
  pendingWindows.push(...failedWindows);

  return { clips: backgroundClips, failedWindows };
}

function finalizeLoadAll(
  totalNewClips: any[],
  lastFailedCount: number,
  remainingPending: number,
  els: LoadAllProgressEls,
) {
  if (els.progressBar) els.progressBar.style.width = "100%";

  if (remainingPending > 0) {
    // Auto-retry gave up; still some windows couldn't be fetched.
    if (els.progressLabel)
      els.progressLabel.textContent = `⚠ ${remainingPending} window${remainingPending > 1 ? "s" : ""} could not be loaded (last attempt: ${lastFailedCount} failed). Try again later.`;
  } else {
    if (els.progressLabel)
      els.progressLabel.textContent = "✓ Complete — saving to cache…";
    if (els.progressStats) els.progressStats.textContent = "";
  }

  if (elements.loader) elements.loader.classList.add("hidden");
  if (elements.loaderText) elements.loaderText.textContent = "";
  setLoadOlderButton("Load all clips", false);
  syncLoadAllBtn();
}

async function saveAndAnnounceCache(channel: string) {
  try {
    await saveCache(channel, allClips);
    terminalToast(
      `${allClips.length.toLocaleString()} clips cached for ${channel}.`,
    );
  } catch (err) {
    console.error("Cache save failed:", err);
    terminalToast("Cache save failed. Storage may be full.");
  }
}

function formatEta(elapsedSec: number, left: number, processed: number): string {
  if (processed <= 1 || elapsedSec <= 3) {
    return `${left} window${left !== 1 ? "s" : ""}`;
  }
  const est = Math.round((elapsedSec / processed) * left);
  return est >= 60 ? `~${Math.round(est / 60)}m ${est % 60}s` : `~${est}s`;
}

// Main search

async function handleSearch() {
  const channel = elements.channelInput?.value.trim();
  if (!channel) return;

  currentChannel = channel;
  resetSearchUI();

  const range = elements.rangeFilter?.value || "all";

  if (range === "all" && (await loadFromCacheIfPresent(channel))) return;

  const { firstBatch, queuedWindows } = await fetchInitialBatch(channel, range);
  pendingWindows = queuedWindows;

  hideLoader();
  applySearchResults(channel, firstBatch);
}

function resetSearchUI() {
  pendingWindows = [];
  syncLoadAllBtn();
  setAllClips([]);
  setDisplayedClips([]);
  resetFilters();

  elements.resultsSection?.classList.remove("hidden");
  hideCacheIndicator();
  if (elements.clipsGrid) elements.clipsGrid.innerHTML = "";
  elements.loader?.classList.remove("hidden");
  elements.emptyState?.classList.add("hidden");
  if (elements.loaderText) elements.loaderText.textContent = "";
}

function resetFilters() {
  if (elements.filterSearchInput) elements.filterSearchInput.value = "";
  elements.filterSearchClear?.classList.add("hidden");

  // Use the same helper the category dropdown uses when the user picks
  // "All Categories", so the visible input + clear button + hidden
  // filter value all stay in sync.
  selectCategory("all", "All Categories");

  if (elements.sortFilter) elements.sortFilter.value = "views";
}

function hideLoader() {
  elements.loader?.classList.add("hidden");
  if (elements.loaderText) elements.loaderText.textContent = "";
}

function formatCacheAge(min: number): string {
  if (min < 60) return `${min}min ago`;
  if (min < 1440) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}

async function loadFromCacheIfPresent(channel: string): Promise<boolean> {
  const cached = await loadCache(channel);
  if (!cached) return false;

  const ageMin = Math.round(
    (Date.now() - new Date(cached.savedAt).getTime()) / 1000 / 60,
  );
  const ageLabel = formatCacheAge(ageMin);

  elements.loader?.classList.add("hidden");

  const useCached = await terminalConfirm(
    `Found ${cached.clips.length.toLocaleString()} cached clips for ${channel} (saved ${ageLabel}). Load from cache?`,
    "USE CACHE",
    "FETCH FRESH",
  );

  if (!useCached) {
    elements.loader?.classList.remove("hidden");
    return false;
  }

  addRecent(channel);
  setAllClips(cached.clips);
  showCacheIndicator(cached.savedAt);
  updateCategories();
  applyFilters();
  // No pending windows, full library is already loaded
  syncLoadAllBtn();
  return true;
}

async function fetchInitialBatch(
  channel: string,
  range: string,
): Promise<{ firstBatch: any[]; queuedWindows: TimeWindow[] }> {
  // Cap the initial render to 1 page (100 clips) for a snappy first
  // paint. The remaining windows stay queued behind the "Load all
  // clips" button. The cached path skips this entirely.
  const INITIAL_PAGE_CAP = 100;

  if (range === "all") {
    // Unbounded → Twitch returns by view count: user sees top clips instantly
    const { clips: firstBatch } = await fetchTopClips(
      channel,
      (n) => {
        if (elements.loaderText) {
          elements.loaderText.textContent = `Loading top clips… ${n}`;
        }
      },
      INITIAL_PAGE_CAP,
    );
    // Queue ALL time windows so "Load all clips" covers full history
    return { firstBatch, queuedWindows: buildWindows("all") };
  }

  // Time-bounded ranges: use windowed strategy from the start
  const windows = buildWindows(range);
  const { clips: firstBatch } = await fetchWindow(
    channel,
    range,
    windows[0],
    (n) => {
      if (elements.loaderText) {
        elements.loaderText.textContent = `Loading… ${n} clips`;
      }
    },
    100,
    INITIAL_PAGE_CAP,
  );
  return { firstBatch, queuedWindows: windows.slice(1) };
}

function applySearchResults(channel: string, firstBatch: any[]) {
  if (firstBatch.length > 0) {
    addRecent(channel);
    setAllClips(firstBatch);
    updateCategories();
    applyFilters();
    syncLoadAllBtn();
  } else {
    setAllClips([]);
    setDisplayedClips([]);
    renderClips();
    if (pendingWindows.length > 0) syncLoadAllBtn();
  }
}

export function initSearch() {
  elements.searchBtn?.addEventListener("click", handleSearch);
  elements.channelInput?.addEventListener("keypress", (e: KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  });

  elements.rangeFilter?.addEventListener("change", handleSearch);
  elements.sortFilter?.addEventListener("change", applyFilters);

  elements.filterSearchInput?.addEventListener("input", () => {
    const hasText = !!elements.filterSearchInput?.value;
    elements.filterSearchClear?.classList.toggle("hidden", !hasText);
    applyFilters();
  });

  elements.filterSearchClear?.addEventListener("click", () => {
    if (!elements.filterSearchInput) return;
    elements.filterSearchInput.value = "";
    elements.filterSearchClear?.classList.add("hidden");
    elements.filterSearchInput.focus();
    applyFilters();
  });

  elements.loadOlderBtn?.addEventListener("click", async () => {
    const ok = await terminalConfirm(
      "Load all clips? This may take a long time depending on how many clips the channel has.",
    );
    if (ok) loadAllClips();
  });

  elements.cacheRefresh?.addEventListener("click", async () => {
    if (!currentChannel) return;
    hideCacheIndicator();
    elements.loader?.classList.remove("hidden");
    if (elements.loaderText)
      elements.loaderText.textContent = "Refreshing clips...";
    elements.emptyState?.classList.add("hidden");

    try {
      await clearCache(currentChannel);
    } catch {
      /* ignore */
    }

    setAllClips([]);
    setDisplayedClips([]);
    if (elements.clipsGrid) elements.clipsGrid.innerHTML = "";

    const range = elements.rangeFilter?.value || "all";

    if (range === "all") {
      const { clips: firstBatch } = await fetchTopClips(
        currentChannel,
        (n) => {
          if (elements.loaderText) {
            elements.loaderText.textContent = `Loading top clips... ${n}`;
          }
        },
        100,
      );
      pendingWindows = buildWindows("all");
      addRecent(currentChannel);
      setAllClips(firstBatch);
      updateCategories();
      applyFilters();
      syncLoadAllBtn();
    } else {
      const windows = buildWindows(range);
      const { clips: firstBatch } = await fetchWindow(
        currentChannel,
        range,
        windows[0],
        (n) => {
          if (elements.loaderText) {
            elements.loaderText.textContent = `Loading... ${n} clips`;
          }
        },
        100,
        100,
      );
      pendingWindows = windows.slice(1);
      addRecent(currentChannel);
      setAllClips(firstBatch);
      updateCategories();
      applyFilters();
      syncLoadAllBtn();
    }

    elements.loader?.classList.add("hidden");
    if (elements.loaderText) elements.loaderText.textContent = "";
  });
}
