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

function filterCategoryList(query: string) {
    if (!elements.categoryList) return;
    const items = elements.categoryList.querySelectorAll("li");
    const lower = query.toLowerCase();
    items.forEach((li) => {
        const text = li.textContent?.toLowerCase() || "";
        li.style.display = !query || text.includes(lower) ? "" : "none";
    });
}

function selectCategory(value: string, label: string) {
    if (elements.categoryFilter) elements.categoryFilter.value = value;
    if (elements.categoryInput)
        elements.categoryInput.value =
            label === "All Categories" ? "" : label;
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

    elements.categoryInput?.addEventListener("keydown", (e: KeyboardEvent) => {
        const list = elements.categoryList;
        if (!list || !list.classList.contains("open")) return;
        const items = [
            ...list.querySelectorAll<HTMLLIElement>(
                "li:not([style*='display: none'])",
            ),
        ];
        const activeIndex = items.findIndex((el) =>
            el.classList.contains("active"),
        );

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = activeIndex + 1;
            if (next < items.length) {
                items.forEach((el) => el.classList.remove("active"));
                items[next].classList.add("active");
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const prev = activeIndex - 1;
            if (prev >= 0) {
                items.forEach((el) => el.classList.remove("active"));
                items[prev].classList.add("active");
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            const active = items.find((el) => el.classList.contains("active"));
            if (active) {
                selectCategory(
                    active.dataset.value || "all",
                    active.textContent || "",
                );
            } else {
                selectCategory("all", "");
            }
        } else if (e.key === "Escape") {
            list.classList.remove("open");
            focusJustOpened = false;
        }
    });
}

export { updateCategories };
