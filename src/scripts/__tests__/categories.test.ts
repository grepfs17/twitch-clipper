import { describe, it, expect, vi, beforeEach } from "vitest";
import { elements } from "../dom";
import * as clips from "../clips";

vi.mock("../dom", () => ({
  elements: {
    categoryFilter: { value: "all" },
    categoryList: null,
    categoryInput: { value: "" },
    categoryClear: { classList: { remove: vi.fn(), add: vi.fn(), toggle: vi.fn() } },
  },
}));

vi.mock("../clips", () => ({
  allClips: [],
  applyFilters: vi.fn(),
}));

describe("categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    elements.categoryFilter!.value = "all";
    elements.categoryInput!.value = "";
  });

  it("updateCategories creates list items for each unique sorted game_name", async () => {
    const appendChild = vi.fn();
    elements.categoryList = { innerHTML: "", appendChild, querySelectorAll: vi.fn().mockReturnValue([]) } as any;
    elements.categoryInput = { value: "" } as any;
    elements.categoryFilter = { value: "all" } as any;
    elements.categoryClear = { classList: { remove: vi.fn(), add: vi.fn() } } as any;

    vi.mocked(clips.allClips).push(
      { game_name: "Valorant" },
      { game_name: "Minecraft" },
      { game_name: "Valorant" },
    );

    const { updateCategories } = await import("../categories");
    updateCategories();

    expect(appendChild).toHaveBeenCalledTimes(3);
    expect(appendChild.mock.calls[0][0].textContent).toBe("All Categories");
    expect(appendChild.mock.calls[1][0].textContent).toBe("Minecraft");
    expect(appendChild.mock.calls[2][0].textContent).toBe("Valorant");
  });

  it("updateCategories restores previous selection when valid", async () => {
    const appendChild = vi.fn();
    elements.categoryList = { innerHTML: "", appendChild, querySelectorAll: vi.fn().mockReturnValue([]) } as any;
    elements.categoryInput = { value: "" } as any;
    elements.categoryFilter = { value: "all" } as any;
    elements.categoryClear = { classList: { remove: vi.fn(), add: vi.fn() } } as any;

    vi.mocked(clips.allClips).push({ game_name: "Minecraft" });
    elements.categoryFilter!.value = "Minecraft";

    const { updateCategories } = await import("../categories");
    updateCategories();

    expect(elements.categoryFilter!.value).toBe("Minecraft");
    expect(elements.categoryInput!.value).toBe("Minecraft");
    expect(elements.categoryClear!.classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("selectCategory sets filter value and calls applyFilters", async () => {
    elements.categoryFilter = { value: "" } as any;
    elements.categoryInput = { value: "" } as any;
    elements.categoryList = { classList: { remove: vi.fn() } } as any;
    elements.categoryClear = { classList: { toggle: vi.fn() } } as any;

    const { selectCategory } = await import("../categories");
    selectCategory("Valorant", "Valorant");

    expect(elements.categoryFilter!.value).toBe("Valorant");
    expect(elements.categoryInput!.value).toBe("Valorant");
    expect(clips.applyFilters).toHaveBeenCalled();
  });

  it("selectCategory clears input when selecting All Categories", async () => {
    elements.categoryFilter = { value: "" } as any;
    elements.categoryInput = { value: "Valorant" } as any;
    elements.categoryList = { classList: { remove: vi.fn() } } as any;
    elements.categoryClear = { classList: { toggle: vi.fn() } } as any;

    const { selectCategory } = await import("../categories");
    selectCategory("all", "All Categories");

    expect(elements.categoryFilter!.value).toBe("all");
    expect(elements.categoryInput!.value).toBe("");
    expect(elements.categoryClear!.classList.toggle).toHaveBeenCalledWith("hidden", true);
  });

  it("filterCategoryList filters list items by query", async () => {
    const item1 = { textContent: "Minecraft", style: { display: "" }, classList: { remove: vi.fn(), add: vi.fn() } };
    const item2 = { textContent: "Valorant", style: { display: "" }, classList: { remove: vi.fn(), add: vi.fn() } };
    elements.categoryList = { querySelectorAll: vi.fn().mockReturnValue([item1, item2]) } as any;

    const { filterCategoryList } = await import("../categories");
    filterCategoryList("mine");

    expect(item1.style.display).toBe("");
    expect(item2.style.display).toBe("none");
  });
});