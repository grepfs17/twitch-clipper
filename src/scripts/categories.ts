import { elements } from "./dom";
import { allClips } from "./clips";
import { applyFilters } from "./clips";

let categoriesList: string[] = [];
let focusJustOpened = false;

function updateCategories() {
  categoriesList = [...new Set(allClips.map((c) => c.game_name))].sort();
  const currentValue = elements.categoryFilter?.value;

  if (elements.categoryList && elements.categoryInput) {
    elements.categoryList.innerHTML = "";
    const allItem = document.createElement("li");
    allItem.textContent = "All Categories";
    allItem.dataset.value = "all";
    elements.categoryList.appendChild(allItem);

    categoriesList.forEach((cat) => {
      const li = document.createElement("li");
      li.textContent = cat;
      li.dataset.value = cat;
      elements.categoryList!.appendChild(li);
    });

    if (currentValue && categoriesList.includes(currentValue)) {
      elements.categoryFilter!.value = currentValue;
      elements.categoryInput.value = currentValue;
      elements.categoryClear?.classList.remove("hidden");
    } else if (currentValue === "all") {
      elements.categoryInput.value = "";
      elements.categoryClear?.classList.add("hidden");
    }
  }
}

export function filterCategoryList(query: string) {
  if (!elements.categoryList) return;
  const items = elements.categoryList.querySelectorAll("li");
  const lower = query.toLowerCase();
  items.forEach((li) => {
    const text = li.textContent?.toLowerCase() || "";
    li.style.display = !query || text.includes(lower) ? "" : "none";
  });
}

export function selectCategory(value: string, label: string) {
  if (elements.categoryFilter) elements.categoryFilter.value = value;
  if (elements.categoryInput)
    elements.categoryInput.value = label === "All Categories" ? "" : label;
  elements.categoryList?.classList.remove("open");
  focusJustOpened = false;
  if (elements.categoryClear) {
    elements.categoryClear.classList.toggle("hidden", value === "all");
  }
  applyFilters();
}

export function initCategories() {
  elements.categoryInput?.addEventListener("input", () => {
    const val = elements.categoryInput!.value;
    elements.categoryFilter!.value = "all";
    filterCategoryList(val);
    elements.categoryList?.classList.add("open");
    if (elements.categoryClear) {
      elements.categoryClear.classList.toggle("hidden", !val);
    }
  });

  elements.categoryClear?.addEventListener("click", () => {
    if (elements.categoryInput) elements.categoryInput.value = "";
    filterCategoryList("");
    elements.categoryInput?.focus();
    selectCategory("all", "All Categories");
  });

  elements.categoryInput?.addEventListener("focus", () => {
    if (categoriesList.length > 0) {
      elements.categoryList?.classList.add("open");
      focusJustOpened = true;
    }
  });

  elements.categoryInput?.addEventListener("click", () => {
    if (categoriesList.length > 0) {
      if (focusJustOpened) {
        focusJustOpened = false;
        return;
      }
      elements.categoryList?.classList.toggle("open");
    }
  });

  elements.categoryInput?.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement !== elements.categoryInput) {
        elements.categoryList?.classList.remove("open");
        focusJustOpened = false;
      }
    }, 150);
  });

  elements.categoryList?.addEventListener("click", (e: MouseEvent) => {
    const li = (e.target as HTMLElement).closest("li") as HTMLLIElement;
    if (!li) return;
    selectCategory(li.dataset.value || "all", li.textContent || "");
  });

  elements.categoryList?.addEventListener("mousemove", (e: MouseEvent) => {
    const li = (e.target as HTMLElement).closest("li") as HTMLLIElement;
    if (!li) return;
    elements.categoryList
      ?.querySelectorAll("li.active")
      .forEach((el) => el.classList.remove("active"));
    li.classList.add("active");
  });

  elements.categoryInput?.addEventListener("keydown", handleCategoryKeydown);
}

interface CategoryKeyContext {
  list: HTMLElement;
  items: HTMLLIElement[];
  activeIndex: number;
}

function getVisibleCategoryItems(list: HTMLElement): HTMLLIElement[] {
  return [
    ...list.querySelectorAll<HTMLLIElement>("li:not([style*='display: none'])"),
  ];
}

function moveActive(items: HTMLLIElement[], nextIndex: number) {
  if (nextIndex < 0 || nextIndex >= items.length) return;
  items.forEach((el) => el.classList.remove("active"));
  items[nextIndex].classList.add("active");
}

const CATEGORY_KEY_HANDLERS: Record<
  string,
  (e: KeyboardEvent, ctx: CategoryKeyContext) => void
> = {
  ArrowDown: (e, { items, activeIndex }) => {
    e.preventDefault();
    moveActive(items, activeIndex + 1);
  },
  ArrowUp: (e, { items, activeIndex }) => {
    e.preventDefault();
    moveActive(items, activeIndex - 1);
  },
  Enter: (e, { items }) => {
    e.preventDefault();
    const active = items.find((el) => el.classList.contains("active"));
    selectCategory(active?.dataset.value || "all", active?.textContent || "");
  },
  Escape: (_e, { list }) => {
    list.classList.remove("open");
    focusJustOpened = false;
  },
};

function handleCategoryKeydown(e: KeyboardEvent) {
  const list = elements.categoryList;
  if (!list || !list.classList.contains("open")) return;
  const items = getVisibleCategoryItems(list);
  const activeIndex = items.findIndex((el) => el.classList.contains("active"));
  CATEGORY_KEY_HANDLERS[e.key]?.(e, { list, items, activeIndex });
}

export { updateCategories };
