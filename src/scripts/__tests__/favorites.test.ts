import { describe, it, expect, vi, beforeEach } from "vitest";
import { elements } from "../dom";
import type { FavoriteClip } from "../favorites";

vi.mock("../dom", () => ({
  elements: {
    favoritesModal: null,
    favoritesBtn: null,
    favoritesCloseBtn: null,
    favoritesGrid: null,
    favoritesCount: null,
    favoritesEmpty: null,
  },
}));

describe("favorites", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    });
    elements.favoritesCount = { textContent: "" } as any;
  });

  describe("isFavorite", () => {
    it("returns false when no favorites stored", async () => {
      const { isFavorite, resetFavoritesCache } = await import("../favorites");
      resetFavoritesCache();
      expect(isFavorite("https://twitch.tv/clip/1")).toBe(false);
    });

    it("returns true when clip url is in favorites", async () => {
      const { isFavorite, resetFavoritesCache } = await import("../favorites");
      resetFavoritesCache();
      const clip: FavoriteClip = {
        url: "https://twitch.tv/clip/TestClip",
        channel: "TestChannel",
        game: "TestGame",
        title: "Test Title",
      };
      mockStorage["tc-favorites"] = JSON.stringify([clip]);

      expect(isFavorite("https://twitch.tv/clip/TestClip")).toBe(true);
    });

    it("returns false when clip url is not in favorites", async () => {
      const { isFavorite, resetFavoritesCache } = await import("../favorites");
      resetFavoritesCache();
      const clip: FavoriteClip = {
        url: "https://twitch.tv/clip/OtherClip",
        channel: "TestChannel",
        game: "TestGame",
        title: "Test Title",
      };
      mockStorage["tc-favorites"] = JSON.stringify([clip]);

      expect(isFavorite("https://twitch.tv/clip/NonExistent")).toBe(false);
    });
  });

  describe("toggleFavorite", () => {
    it("adds clip when not in favorites", async () => {
      const { toggleFavorite, isFavorite, resetFavoritesCache } =
        await import("../favorites");
      resetFavoritesCache();
      const clip: FavoriteClip = {
        url: "https://twitch.tv/clip/NewClip",
        channel: "Channel",
        game: "Game",
        title: "New Clip",
      };

      toggleFavorite(clip);

      expect(isFavorite("https://twitch.tv/clip/NewClip")).toBe(true);
      expect(mockStorage["tc-favorites"]).toContain("NewClip");
    });

    it("removes clip when already in favorites", async () => {
      const { toggleFavorite, isFavorite, resetFavoritesCache } =
        await import("../favorites");
      resetFavoritesCache();
      const clip: FavoriteClip = {
        url: "https://twitch.tv/clip/ExistingClip",
        channel: "Channel",
        game: "Game",
        title: "Existing Clip",
      };
      mockStorage["tc-favorites"] = JSON.stringify([clip]);

      toggleFavorite(clip);

      expect(isFavorite("https://twitch.tv/clip/ExistingClip")).toBe(false);
    });

    it("does not duplicate existing clip", async () => {
      const { toggleFavorite, resetFavoritesCache } =
        await import("../favorites");
      resetFavoritesCache();
      const clip: FavoriteClip = {
        url: "https://twitch.tv/clip/DupClip",
        channel: "Channel",
        game: "Game",
        title: "Dup Clip",
      };
      mockStorage["tc-favorites"] = JSON.stringify([clip]);

      toggleFavorite(clip);
      toggleFavorite(clip);

      const stored = JSON.parse(mockStorage["tc-favorites"]);
      expect(
        stored.filter((f: FavoriteClip) => f.url === clip.url).length,
      ).toBe(1);
    });
  });

  describe("updateButtonCount", () => {
    it("updates favoritesCount text content", async () => {
      const { updateButtonCount, resetFavoritesCache } =
        await import("../favorites");
      resetFavoritesCache();
      const clip: FavoriteClip = {
        url: "https://twitch.tv/clip/CountClip",
        channel: "Channel",
        game: "Game",
        title: "Count Clip",
      };
      mockStorage["tc-favorites"] = JSON.stringify([clip]);

      updateButtonCount();

      expect(elements.favoritesCount!.textContent).toBe("1");
    });

    it("shows 0 when no favorites", async () => {
      const { updateButtonCount, resetFavoritesCache } =
        await import("../favorites");
      resetFavoritesCache();
      updateButtonCount();

      expect(elements.favoritesCount!.textContent).toBe("0");
    });
  });

  describe("escapeHtml", () => {
    it("escapes HTML special characters", async () => {
      const { escapeHtml } = await import("../favorites");
      expect(escapeHtml("<script>&")).toBe("&lt;script&gt;&amp;");
      expect(escapeHtml('"quotes"')).toBe("&quot;quotes&quot;");
    });
  });
});
