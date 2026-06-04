import { elements } from "./dom";
import {
  allClips,
  setAllClips,
  setDisplayedClips,
  appendClips,
  applyFilters,
  renderClips,
} from "./clips";
import { fetchClips } from "./api";
import { updateCategories } from "./categories";
import { addRecent } from "./recent";
import { loadCache, saveCache, clearCache } from "./cache";
import { terminalConfirm, terminalToast } from "./notify";

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

/** Paginate through one bounded time window. */
async function fetchWindow(
  channel: string,
  range: string,
  win: TimeWindow,
  onProgress?: (n: number) => void,
  pageDelay = 50,
): Promise<any[]> {
  const maxClips = parseInt(import.meta.env.PUBLIC_MAX_CLIPS || "50000", 10);
  const result: any[] = [];
  let cursor = "";

  while (true) {
    let data: any;
    try {
      data = await fetchClips(
        channel,
        range,
        cursor,
        win.startedAt,
        win.endedAt,
      );
    } catch {
      break;
    }
    if (!data || !data.clips || data.clips.length === 0) break;

    result.push(...data.clips);
    cursor = data.pagination?.cursor || "";
    onProgress?.(result.length);

    if (!cursor || result.length >= maxClips) break;
    await new Promise((r) => setTimeout(r, pageDelay));
  }

  return result;
}

/**
 * Unbounded paginated fetch — Twitch returns clips sorted by view count
 * when no date range is given. Used for the initial "all" search so the
 * user immediately sees the most popular clips.
 */
async function fetchTopClips(
  channel: string,
  onProgress?: (n: number) => void,
): Promise<any[]> {
  return fetchWindow(
    channel,
    "all",
    { startedAt: "", endedAt: "" },
    onProgress,
    50,
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
  const backgroundClips = await runLoadAllWindowPool(range, els);

  finalizeLoadAll(backgroundClips, els);
  updateCategories();
  applyFilters();

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
): Promise<any[]> {
  const backgroundClips: any[] = [];
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
    4,
    windows,
    async (win) => {
      const batch = await fetchWindow(currentChannel, range, win);
      if (batch.length > 0) backgroundClips.push(...batch);
    },
    () => {
      windowsProcessed++;
      updateProgress();
    },
  );

  return backgroundClips;
}

function finalizeLoadAll(backgroundClips: any[], els: LoadAllProgressEls) {
  if (els.progressBar) els.progressBar.style.width = "100%";
  if (els.progressLabel)
    els.progressLabel.textContent = "✓ Complete — saving to cache…";
  if (els.progressStats) els.progressStats.textContent = "";

  if (backgroundClips.length > 0) appendClips(backgroundClips);

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
  if (elements.filterSearchInput) elements.filterSearchInput.value = "";
  elements.filterSearchClear?.classList.add("hidden");

  elements.resultsSection?.classList.remove("hidden");
  hideCacheIndicator();
  if (elements.clipsGrid) elements.clipsGrid.innerHTML = "";
  elements.loader?.classList.remove("hidden");
  elements.emptyState?.classList.add("hidden");
  if (elements.loaderText) elements.loaderText.textContent = "";
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
    `Found <strong>${cached.clips.length.toLocaleString()} cached clips</strong> for <strong>${channel}</strong> (saved ${ageLabel}). Load from cache?`,
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
  if (range === "all") {
    // Unbounded → Twitch returns by view count: user sees top clips instantly
    const firstBatch = await fetchTopClips(channel, (n) => {
      if (elements.loaderText) {
        elements.loaderText.textContent = `Loading top clips… ${n}`;
      }
    });
    // Queue ALL time windows so "Load all clips" covers full history
    return { firstBatch, queuedWindows: buildWindows("all") };
  }

  // Time-bounded ranges: use windowed strategy from the start
  const windows = buildWindows(range);
  const firstBatch = await fetchWindow(channel, range, windows[0], (n) => {
    if (elements.loaderText) {
      elements.loaderText.textContent = `Loading… ${n} clips`;
    }
  });
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
    const hasText = !!elements.filterSearchInput.value;
    elements.filterSearchClear?.classList.toggle("hidden", !hasText);
    applyFilters();
  });

  elements.filterSearchClear?.addEventListener("click", () => {
    elements.filterSearchInput.value = "";
    elements.filterSearchClear.classList.add("hidden");
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
      const firstBatch = await fetchTopClips(currentChannel, (n) => {
        if (elements.loaderText) {
          elements.loaderText.textContent = `Loading top clips... ${n}`;
        }
      });
      pendingWindows = buildWindows("all");
      addRecent(currentChannel);
      setAllClips(firstBatch);
      updateCategories();
      applyFilters();
      syncLoadAllBtn();
    } else {
      const windows = buildWindows(range);
      const firstBatch = await fetchWindow(
        currentChannel,
        range,
        windows[0],
        (n) => {
          if (elements.loaderText) {
            elements.loaderText.textContent = `Loading... ${n} clips`;
          }
        },
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
