import { elements } from "./dom";
import { allClips, setAllClips, setDisplayedClips, appendClips, applyFilters, renderClips } from "./clips";
import { fetchClips } from "./api";
import { updateCategories } from "./categories";
import { addRecent } from "./recent";

// ── Time window helpers ───────────────────────────────────────────────────────

interface TimeWindow {
    startedAt: string;
    endedAt: string;
}

/**
 * Slice the requested range into fixed-size windows walking backwards from now.
 * Each window is independently paginated to work around Twitch's cursor limit
 * (cursors expire / become invalid across large result sets).
 *
 * Window sizes:
 *   24h  → 1 window of 24h    (no need to chunk)
 *   7d   → 1 window of 7d     (no need to chunk)
 *   30d  → chunks of 5 days   → 6 windows
 *   all  → chunks of 30 days  → 24 windows (~2 years back)
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
        const chunkDays = 5;
        const totalWindows = 6; // 6 × 5d = 30d
        const windows: TimeWindow[] = [];
        let end = new Date(now);
        for (let i = 0; i < totalWindows; i++) {
            const start = new Date(end.getTime() - chunkDays * 24 * 60 * 60 * 1000);
            windows.push({ startedAt: start.toISOString(), endedAt: end.toISOString() });
            end = new Date(start);
        }
        return windows;
    }

    // "all" → 24 monthly windows going back ~2 years
    const chunkDays = 30;
    const totalWindows = 24;
    const windows: TimeWindow[] = [];
    let end = new Date(now);
    for (let i = 0; i < totalWindows; i++) {
        const start = new Date(end.getTime() - chunkDays * 24 * 60 * 60 * 1000);
        windows.push({ startedAt: start.toISOString(), endedAt: end.toISOString() });
        end = new Date(start);
    }
    return windows;
}

// ── State ─────────────────────────────────────────────────────────────────────

/** Windows that haven't been fetched yet (shifted off front as we load them). */
let pendingWindows: TimeWindow[] = [];
let currentChannel = "";

// ── Load-older button ─────────────────────────────────────────────────────────

function syncLoadAllBtn() {
    if (!elements.loadOlderBtn) return;
    if (pendingWindows.length > 0) {
        elements.loadOlderBtn.classList.remove("hidden");
        elements.loadOlderBtn.textContent = "Load all clips";
    } else {
        elements.loadOlderBtn.classList.add("hidden");
    }
}

// ── Fetch one window (full pagination) ───────────────────────────────────────

async function fetchWindow(
    channel: string,
    range: string,
    window: TimeWindow,
    onProgress?: (loaded: number) => void,
): Promise<any[]> {
    const maxClips = parseInt(import.meta.env.PUBLIC_MAX_CLIPS || "5000", 10);
    const result: any[] = [];
    let cursor = "";

    while (true) {
        const data = await fetchClips(channel, range, cursor, window.startedAt, window.endedAt);
        if (!data || !data.clips || data.clips.length === 0) break;

        result.push(...data.clips);
        cursor = data.pagination?.cursor || "";
        onProgress?.(result.length);

        if (!cursor || result.length >= maxClips) break;

        // Small back-off to respect Twitch rate limits (800 req/min for App tokens)
        await new Promise((r) => setTimeout(r, 150));
    }

    return result;
}

// ── Load next pending window ──────────────────────────────────────────────────

async function loadAllClips() {
    if (!currentChannel || pendingWindows.length === 0) return;

    const range = elements.rangeFilter?.value || "all";
    elements.loadOlderBtn!.disabled = true;
    elements.loadOlderBtn!.textContent = "Loading…";
    if (elements.loader) elements.loader.classList.remove("hidden");

    // Drain every remaining window sequentially
    while (pendingWindows.length > 0) {
        const win = pendingWindows.shift()!;
        const prevCount = allClips.length;

        const batch = await fetchWindow(currentChannel, range, win, (n) => {
            if (elements.loaderText) {
                elements.loaderText.textContent =
                    `Loading ${prevCount + n} clips… (${pendingWindows.length} window${pendingWindows.length !== 1 ? "s" : ""} remaining)`;
            }
        });

        if (batch.length > 0) {
            appendClips(batch);
            updateCategories();
            applyFilters();
        }
    }

    if (elements.loader) elements.loader.classList.add("hidden");
    if (elements.loaderText) elements.loaderText.textContent = "";
    elements.loadOlderBtn!.disabled = false;
    syncLoadAllBtn();
}

// ── Main search ───────────────────────────────────────────────────────────────

async function handleSearch() {
    const channel = elements.channelInput?.value.trim();
    if (!channel) return;

    // Reset state
    currentChannel = channel;
    pendingWindows = [];
    syncLoadAllBtn();
    setAllClips([]);
    setDisplayedClips([]);

    elements.resultsSection?.classList.remove("hidden");
    if (elements.clipsGrid) elements.clipsGrid.innerHTML = "";
    elements.loader?.classList.remove("hidden");
    elements.emptyState?.classList.add("hidden");
    if (elements.loaderText) elements.loaderText.textContent = "";

    const range = elements.rangeFilter?.value || "all";
    const windows = buildWindows(range);

    // Always fetch the first window immediately on search
    const firstWindow = windows[0];
    pendingWindows = windows.slice(1);

    const firstBatch = await fetchWindow(channel, range, firstWindow, (n) => {
        if (elements.loaderText) {
            elements.loaderText.textContent = `Loading ${n} clips…`;
        }
    });

    elements.loader?.classList.add("hidden");
    if (elements.loaderText) elements.loaderText.textContent = "";

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
        // Still offer to check older windows in case the most recent chunk was empty
        if (pendingWindows.length > 0) {
            syncLoadAllBtn();
        }
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSearch() {
    elements.searchBtn?.addEventListener("click", handleSearch);
    elements.channelInput?.addEventListener("keypress", (e: KeyboardEvent) => {
        if (e.key === "Enter") handleSearch();
    });

    elements.rangeFilter?.addEventListener("change", handleSearch);
    elements.sortFilter?.addEventListener("change", applyFilters);

    elements.loadOlderBtn?.addEventListener("click", loadAllClips);
}
