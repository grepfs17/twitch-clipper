import { elements } from "./dom";
import { openClipModal } from "./modal";
import { toggleFavorite, isFavorite } from "./favorites";

export let allClips: any[] = [];
export let displayedClips: any[] = [];
const clipIds = new Set<string>();

const BATCH_SIZE = 50;
let renderIndex = 0;
let sentinel: HTMLDivElement | null = null;
let observer: IntersectionObserver | null = null;

export function setAllClips(val: any[]) {
  allClips = val;
  clipIds.clear();
  for (const c of val) clipIds.add(c.id);
}
export function setDisplayedClips(val: any[]) {
  displayedClips = val;
}

export function appendClips(newClips: any[]) {
  const unique = newClips.filter((c) => !clipIds.has(c.id));
  for (const c of unique) clipIds.add(c.id);
  allClips.push(...unique);
}

function buildClipCard(clip: any): HTMLDivElement {
  const date = new Date(clip.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
                <span class="clip-creator">${clip.creator_name}</span>
                <span class="meta-dot"></span>
                <span class="clip-game">${clip.game_name}</span>
                <span class="meta-dot"></span>
                <span class="clip-date">${date}</span>
            </div>
        </div>
        <button type="button" class="fav-btn" data-clip-url="${clip.url}" aria-label="Toggle favorite">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" class="fav-icon"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
        </button>
    `;
  const favBtn = card.querySelector(".fav-btn") as HTMLButtonElement;
  const updateFavIcon = () => {
    const icon = favBtn.querySelector(".fav-icon") as SVGElement;
    if (isFavorite(clip.url)) {
      icon.setAttribute("fill", "var(--amber)");
      favBtn.classList.add("active");
    } else {
      icon.setAttribute("fill", "currentColor");
      favBtn.classList.remove("active");
    }
  };
  updateFavIcon();
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite({
      url: clip.url,
      channel: clip.broadcaster_name,
      game: clip.game_name,
      title: clip.title,
      thumbnailUrl: clip.thumbnail_url,
    });
    updateFavIcon();
  });
  card.addEventListener("click", () => openClipModal(clip));
  return card;
}

function setupLazyObserver() {
  if (observer) observer.disconnect();
  sentinel?.remove();

  if (renderIndex >= displayedClips.length) return;

  sentinel = document.createElement("div");
  sentinel.className = "lazy-sentinel";
  sentinel.style.height = "1px";
  elements.clipsGrid?.parentNode?.appendChild(sentinel);

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    },
    { rootMargin: "300px" },
  );
  observer.observe(sentinel);
}

function loadMore() {
  const end = Math.min(renderIndex + BATCH_SIZE, displayedClips.length);
  for (let i = renderIndex; i < end; i++) {
    const card = buildClipCard(displayedClips[i]);
    elements.clipsGrid?.appendChild(card);
  }
  renderIndex = end;
  updateCount();

  if (renderIndex >= displayedClips.length) {
    observer?.disconnect();
    sentinel?.remove();
    sentinel = null;
  }
}

function updateCount() {
  if (elements.clipsCount) {
    elements.clipsCount.textContent = displayedClips.length.toString();
  }
}

export function renderClips() {
  if (!elements.clipsGrid) return;
  elements.clipsGrid.innerHTML = "";

  if (displayedClips.length === 0) {
    elements.emptyState?.classList.remove("hidden");
  } else {
    elements.emptyState?.classList.add("hidden");
  }

  renderIndex = 0;
  loadMore();
  setupLazyObserver();
  updateCount();
}

export function applyFilters() {
  const category = elements.categoryFilter?.value || "all";
  const searchText =
    elements.filterSearchInput?.value.trim().toLowerCase() || "";
  const sortBy = elements.sortFilter?.value || "views";

  let filtered = [...allClips];

  if (category !== "all") {
    filtered = filtered.filter((c) => c.game_name === category);
  }

  if (searchText) {
    filtered = filtered.filter(
      (c) =>
        c.title?.toLowerCase().includes(searchText) ||
        c.creator_name?.toLowerCase().includes(searchText) ||
        c.game_name?.toLowerCase().includes(searchText),
    );
  }

  if (sortBy === "views") {
    filtered.sort((a, b) => b.view_count - a.view_count);
  } else if (sortBy === "latest") {
    filtered.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  } else if (sortBy === "oldest") {
    filtered.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  setDisplayedClips(filtered);
  renderClips();
}
