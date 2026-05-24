import { elements } from "./dom";
import { openClipModal } from "./modal";

export let allClips: any[] = [];
export let displayedClips: any[] = [];

export function setAllClips(val: any[]) { allClips = val; }
export function setDisplayedClips(val: any[]) { displayedClips = val; }

export function appendClips(newClips: any[]) {
    const existingIds = new Set(allClips.map((c) => c.id));
    const unique = newClips.filter((c) => !existingIds.has(c.id));
    setAllClips([...allClips, ...unique]);
}

export function renderClips() {
    if (!elements.clipsGrid) return;
    elements.clipsGrid.innerHTML = "";

    if (displayedClips.length === 0) {
        elements.emptyState?.classList.remove("hidden");
    } else {
        elements.emptyState?.classList.add("hidden");
    }

    displayedClips.forEach((clip) => {
        const date = new Date(clip.created_at).toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric",
                year: "numeric",
            },
        );

        const viewCount = new Intl.NumberFormat().format(clip.view_count);
        const duration = Math.round(clip.duration);

        const card = document.createElement("div");
        card.className = "clip-card";
        card.dataset.clipUrl = clip.url;
        card.innerHTML = `
            <div class="thumb-container">
                <img src="${clip.thumbnail_url}" alt="${clip.title}" loading="lazy" />
                <div class="clip-overlay top">
                    <span class="views-badge">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                        ${viewCount}
                    </span>
                </div>
                <div class="clip-overlay bottom">
                    <span class="duration-badge">${duration}s</span>
                </div>
            </div>
            <div class="clip-info">
                <h3 class="clip-title">${clip.title}</h3>
                <div class="clip-meta">
                    <span class="clip-game">${clip.game_name}</span>
                    <span class="meta-dot"></span>
                    <span class="clip-date">${date}</span>
                </div>
            </div>
        `;
        card.addEventListener("click", () => openClipModal(clip));
        elements.clipsGrid!.appendChild(card);
    });

    if (elements.clipsCount) {
        elements.clipsCount.textContent = displayedClips.length.toString();
    }
}

export function applyFilters() {
    const category = elements.categoryFilter?.value || "all";
    const sortBy = elements.sortFilter?.value || "views";

    let filtered = [...allClips];

    if (category !== "all") {
        filtered = filtered.filter((c) => c.game_name === category);
    }

    if (sortBy === "views") {
        filtered.sort((a, b) => b.view_count - a.view_count);
    } else if (sortBy === "latest") {
        filtered.sort(
            (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
        );
    } else if (sortBy === "oldest") {
        filtered.sort(
            (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
        );
    }

    setDisplayedClips(filtered);
    renderClips();
}
