import { describe, it, expect, vi, beforeEach } from "vitest";
import { elements } from "../dom";
import * as clips from "../clips";
import * as cache from "../cache";
import * as notify from "../notify";

vi.mock("../dom", () => ({
  elements: {
    channelInput: { value: "" },
    searchBtn: null,
    rangeFilter: { value: "all" },
    sortFilter: { value: "views" },
    filterSearchInput: { value: "" },
    filterSearchClear: null,
    loadOlderBtn: null,
    cacheRefresh: null,
    resultsSection: null,
    clipsGrid: null,
    loader: null,
    loaderText: null,
    emptyState: null,
    cacheIndicator: null,
  },
}));

vi.mock("../clips", () => ({
  allClips: [],
  setAllClips: vi.fn(),
  setDisplayedClips: vi.fn(),
  appendClips: vi.fn(),
  applyFilters: vi.fn(),
  renderClips: vi.fn(),
}));

vi.mock("../cache", () => ({
  loadCache: vi.fn(),
  saveCache: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock("../notify", () => ({
  terminalConfirm: vi.fn(),
  terminalToast: vi.fn(),
  rateLimitToast: vi.fn(),
}));

describe("search", () => {
  describe("buildWindows", () => {
    it("returns a single 24h window", async () => {
      const { __testing } = await import("../search");
      const windows = __testing.buildWindows("24h");
      expect(windows).toHaveLength(1);
      const span =
        new Date(windows[0].endedAt).getTime() -
        new Date(windows[0].startedAt).getTime();
      expect(span).toBe(24 * 60 * 60 * 1000);
    });

    it("returns a single 7d window", async () => {
      const { __testing } = await import("../search");
      const windows = __testing.buildWindows("7d");
      expect(windows).toHaveLength(1);
      const span =
        new Date(windows[0].endedAt).getTime() -
        new Date(windows[0].startedAt).getTime();
      expect(span).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("returns 6 windows of 5 days for 30d", async () => {
      const { __testing } = await import("../search");
      const windows = __testing.buildWindows("30d");
      expect(windows).toHaveLength(6);
      const span =
        new Date(windows[0].endedAt).getTime() -
        new Date(windows[0].startedAt).getTime();
      expect(span).toBe(5 * 24 * 60 * 60 * 1000);
    });

    it("returns non-overlapping 30-day windows for 'all' that walk back to 2014", async () => {
      const { __testing } = await import("../search");
      const windows = __testing.buildWindows("all");
      expect(windows.length).toBeGreaterThan(50);
      const earliest = new Date(windows[windows.length - 1].startedAt);
      expect(earliest.getTime()).toBeLessThanOrEqual(
        new Date("2014-01-01T00:00:00Z").getTime(),
      );
      // Each window's startedAt equals the previous endedAt (contiguity).
      for (let i = 1; i < windows.length; i++) {
        expect(windows[i].endedAt).toBe(windows[i - 1].startedAt);
      }
    });
  });

  describe("asyncPool", () => {
    it("respects concurrency limit", async () => {
      const { __testing } = await import("../search");
      const items = Array.from({ length: 10 }, (_, i) => i);
      let active = 0;
      let peak = 0;
      await __testing.asyncPool(3, items, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
      expect(peak).toBeLessThanOrEqual(3);
    });

    it("calls onItemComplete once per item", async () => {
      const { __testing } = await import("../search");
      const items = [1, 2, 3, 4, 5];
      const onItemComplete = vi.fn();
      await __testing.asyncPool(2, items, async () => {}, onItemComplete);
      expect(onItemComplete).toHaveBeenCalledTimes(5);
    });

    it("handles empty input gracefully", async () => {
      const { __testing } = await import("../search");
      const fn = vi.fn();
      await __testing.asyncPool(3, [], fn);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("formatEta", () => {
    it("returns simple count while too early to estimate", async () => {
      const { __testing } = await import("../search");
      expect(__testing.formatEta(1, 5, 1)).toBe("5 windows");
      expect(__testing.formatEta(0, 1, 0)).toBe("1 window");
      expect(__testing.formatEta(3, 10, 1)).toBe("10 windows");
    });

    it("returns mm:ss once enough samples exist", async () => {
      const { __testing } = await import("../search");
      // 30s elapsed, 5 processed, 10 left -> (30/5)*10 = 60s
      expect(__testing.formatEta(30, 10, 5)).toBe("~1m 0s");
    });

    it("returns seconds estimate for short waits", async () => {
      const { __testing } = await import("../search");
      // 20s elapsed, 4 processed, 2 left -> (20/4)*2 = 10s
      expect(__testing.formatEta(20, 2, 4)).toBe("~10s");
    });
  });

  describe("formatCacheAge", () => {
    it("formats minutes", async () => {
      const { __testing } = await import("../search");
      expect(__testing.formatCacheAge(5)).toBe("5min ago");
      expect(__testing.formatCacheAge(59)).toBe("59min ago");
    });

    it("formats hours", async () => {
      const { __testing } = await import("../search");
      expect(__testing.formatCacheAge(60)).toBe("1h ago");
      expect(__testing.formatCacheAge(120)).toBe("2h ago");
    });

    it("formats days", async () => {
      const { __testing } = await import("../search");
      expect(__testing.formatCacheAge(60 * 24)).toBe("1d ago");
      expect(__testing.formatCacheAge(60 * 24 * 3)).toBe("3d ago");
    });
  });
});
