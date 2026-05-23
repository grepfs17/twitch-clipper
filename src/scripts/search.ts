import { elements } from "./dom";
import { setAllClips, setDisplayedClips, applyFilters, renderClips } from "./clips";
import { fetchClips } from "./api";
import { updateCategories } from "./categories";
import { addRecent } from "./recent";

async function handleSearch() {
    const channel = elements.channelInput?.value.trim();
    if (!channel) return;

    elements.resultsSection?.classList.remove("hidden");
    if (elements.clipsGrid) elements.clipsGrid.innerHTML = "";
    elements.loader?.classList.remove("hidden");
    elements.emptyState?.classList.add("hidden");
    if (elements.loaderText) elements.loaderText.textContent = "";
    let allFetched: any[] = [];
    let cursor = "";
    const maxClips = parseInt(import.meta.env.PUBLIC_MAX_CLIPS || "5000", 10);

    while (true) {
        const data = await fetchClips(channel, elements.rangeFilter?.value, cursor);
        if (!data || !data.clips || data.clips.length === 0) break;

        allFetched = [...allFetched, ...data.clips];
        cursor = data.pagination?.cursor || "";

        if (elements.loaderText) {
            elements.loaderText.textContent = `Loading ${allFetched.length} clips...`;
        }

        if (!cursor || allFetched.length >= maxClips) break;
        await new Promise((r) => setTimeout(r, 200));
    }

    elements.loader?.classList.add("hidden");

    if (allFetched.length > 0) {
        addRecent(channel);
        setAllClips(allFetched);
        updateCategories();
        applyFilters();
    } else {
        setAllClips([]);
        setDisplayedClips([]);
        renderClips();
    }
}

export function initSearch() {
    elements.searchBtn?.addEventListener("click", handleSearch);
    elements.channelInput?.addEventListener("keypress", (e: KeyboardEvent) => {
        if (e.key === "Enter") handleSearch();
    });

    elements.rangeFilter?.addEventListener("change", handleSearch);
    elements.sortFilter?.addEventListener("change", applyFilters);
}
