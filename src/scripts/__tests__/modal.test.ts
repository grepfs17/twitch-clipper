import { describe, it, expect, vi, beforeEach } from "vitest";
import { elements } from "../dom";
import * as favorites from "../favorites";
import * as notes from "../notes";

vi.mock("../dom", () => ({
  elements: {
    modal: null,
    modalTitle: null,
    modalCreator: null,
    modalGame: null,
    modalDate: null,
    modalIframe: null,
    modalSpinner: null,
    modalCloseBtn: null,
    modalCopyBtn: null,
    modalOpenBtn: null,
    modalFavBtn: null,
    modalDownloadBtn: null,
    modalNotes: null,
    modalNotesSection: null,
    modalNotesToggle: null,
    qualitySelect: null,
    qualitySelectTrigger: null,
    qualitySelectOptions: null,
    downloadProgress: null,
    downloadProgressFill: null,
    downloadProgressText: null,
    favoritesModal: null,
  },
}));

vi.mock("../favorites", () => ({
  isFavorite: vi.fn(() => false),
  toggleFavorite: vi.fn(),
}));

vi.mock("../notes", () => ({
  getNote: vi.fn(),
  saveNote: vi.fn(),
}));

describe("modal", () => {
  describe("slugFromUrl", () => {
    it("extracts slug from clips.twitch.tv URL", async () => {
      const { __testing } = await import("../modal");
      expect(__testing.slugFromUrl("https://clips.twitch.tv/AwesomeClip")).toBe(
        "AwesomeClip",
      );
    });

    it("extracts slug from /clip/ URL", async () => {
      const { __testing } = await import("../modal");
      expect(__testing.slugFromUrl("https://example.com/clip/MyClip-123")).toBe(
        "MyClip-123",
      );
    });

    it("returns 'clip' fallback for unparseable URLs", async () => {
      const { __testing } = await import("../modal");
      expect(__testing.slugFromUrl("https://example.com/")).toBe("clip");
    });
  });

  describe("sanitizeFilename", () => {
    it("strips path-traversal and control characters", async () => {
      const { __testing } = await import("../modal");
      expect(__testing.sanitizeFilename("a/b\\c:d")).toBe("a b c d");
      expect(__testing.sanitizeFilename("hello\x00world")).toBe("hello world");
    });

    it("trims whitespace", async () => {
      const { __testing } = await import("../modal");
      expect(__testing.sanitizeFilename("  padded  ")).toBe("padded");
    });
  });

  describe("makeFilename", () => {
    it("appends .mp4 extension", async () => {
      const { __testing } = await import("../modal");
      expect(__testing.makeFilename("My Clip")).toBe("My Clip.mp4");
    });

    it("sanitizes the basename", async () => {
      const { __testing } = await import("../modal");
      expect(__testing.makeFilename("a/b")).toBe("a b.mp4");
    });
  });

  describe("formatClipDate", () => {
    it("returns a locale-formatted date", async () => {
      const { __testing } = await import("../modal");
      const out = __testing.formatClipDate("2024-03-15T12:00:00Z");
      // jsdom's en-US locale will produce something like "Mar 15, 2024"
      expect(out).toMatch(/2024/);
      expect(out).toMatch(/15/);
    });
  });

  describe("initModal — download button guard", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("registers a click listener on the download button when present", async () => {
      const addEventListener = vi.fn();
      elements.modalDownloadBtn = { addEventListener } as any;
      elements.modalIframe = { closest: vi.fn().mockReturnValue(null) } as any;
      const { initModal } = await import("../modal");
      initModal();
      const click = addEventListener.mock.calls.find(([e]) => e === "click");
      expect(click).toBeDefined();
    });

    it("does not throw when the download button is missing", async () => {
      elements.modalDownloadBtn = null;
      const { initModal } = await import("../modal");
      expect(() => initModal()).not.toThrow();
    });
  });
});
