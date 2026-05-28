import { elements } from "./dom";

const STORAGE_KEY = "tc-favorites";

export interface FavoriteClip {
  url: string;
  channel: string;
  game: string;
  title: string;
  thumbnailUrl?: string;
}

function loadFavorites(): FavoriteClip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(list: FavoriteClip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isFavorite(clipUrl: string): boolean {
  return loadFavorites().some((f) => f.url === clipUrl);
}

export function addFavorite(clip: FavoriteClip) {
  let list = loadFavorites();
  if (!list.some((f) => f.url === clip.url)) {
    list = [clip, ...list];
    saveFavorites(list);
  }
  renderFavorites();
  updateButtonCount();
}

export function removeFavorite(clipUrl: string) {
  let list = loadFavorites();
  list = list.filter((f) => f.url !== clipUrl);
  saveFavorites(list);
  renderFavorites();
  updateButtonCount();
}

export function toggleFavorite(clip: FavoriteClip) {
  if (isFavorite(clip.url)) {
    removeFavorite(clip.url);
  } else {
    addFavorite(clip);
  }
}

export function getFavorites(): FavoriteClip[] {
  return loadFavorites();
}

function openFavoritesModal() {
  if (!elements.favoritesModal) return;
  elements.favoritesModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeFavoritesModal() {
  if (!elements.favoritesModal) return;
  elements.favoritesModal.classList.add("hidden");
  document.body.style.overflow = "";
}

function updateButtonCount() {
  const count = loadFavorites().length;
  if (elements.favoritesCount) {
    elements.favoritesCount.textContent = count.toString();
  }
}

export function initFavorites() {
  elements.favoritesBtn?.addEventListener("click", openFavoritesModal);
  elements.favoritesCloseBtn?.addEventListener("click", closeFavoritesModal);
  elements.favoritesModal?.addEventListener("click", (e) => {
    if (e.target === elements.favoritesModal) closeFavoritesModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !elements.favoritesModal?.classList.contains("hidden")) {
      closeFavoritesModal();
    }
  });

  const grid = document.getElementById("favoritesGrid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      const removeBtn = target.closest(".fav-remove") as HTMLButtonElement;
      if (removeBtn) {
        const url = removeBtn.closest(".fav-clip")?.getAttribute("data-clip-url")
          || removeBtn.closest(".fav-game")?.getAttribute("data-game-url")
          || removeBtn.closest(".fav-channel")?.getAttribute("data-channel");
        if (removeBtn.classList.contains("fav-remove-clip")) {
          const clipUrl = removeBtn.closest(".fav-clip")?.getAttribute("data-clip-url");
          if (clipUrl) removeFavorite(clipUrl);
        }
        return;
      }

      const channelHeader = target.closest(".fav-channel-header") as HTMLElement;
      if (channelHeader) {
        const channelNode = channelHeader.closest(".fav-channel") as HTMLElement;
        if (channelNode) channelNode.classList.toggle("collapsed");
        return;
      }

      const gameHeader = target.closest(".fav-game-header") as HTMLElement;
      if (gameHeader) {
        const gameNode = gameHeader.closest(".fav-game") as HTMLElement;
        if (gameNode) gameNode.classList.toggle("collapsed");
        return;
      }

      const clipItem = target.closest(".fav-clip") as HTMLElement;
      if (clipItem) {
        const clipUrl = clipItem.getAttribute("data-clip-url");
        if (!clipUrl) return;
        fetch(`/api/clip/lookup?url=${encodeURIComponent(clipUrl)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.clip) {
              closeFavoritesModal();
              window.dispatchEvent(new CustomEvent("fav:openClip", { detail: data.clip }));
            }
          })
          .catch(() => {});
      }
    });
  }
  renderFavorites();
  updateButtonCount();
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderFavorites() {
  const grid = document.getElementById("favoritesGrid");
  const empty = document.getElementById("favoritesEmpty");

  if (!grid) return;

  const favorites = loadFavorites();

  if (favorites.length === 0) {
    empty?.classList.remove("hidden");
    grid.innerHTML = "";
    return;
  }

  empty?.classList.add("hidden");

  const tree: Record<string, Record<string, FavoriteClip[]>> = {};
  for (const fav of favorites) {
    const channel = fav.channel || "Unknown Channel";
    const game = fav.game || "Unknown Game";
    if (!tree[channel]) tree[channel] = {};
    if (!tree[channel][game]) tree[channel][game] = [];
    tree[channel][game].push(fav);
  }

  const channels = Object.keys(tree).sort((a, b) => a.localeCompare(b));

  grid.innerHTML = channels.map((channel) => {
    const games = Object.keys(tree[channel]).sort((a, b) => a.localeCompare(b));
    const channelClipCount = games.reduce((sum, g) => sum + tree[channel][g].length, 0);
    const gameHtml = games.map((game) => {
      const clips = tree[channel][game];
      const clipHtml = clips.map((clip) => `
        <div class="fav-clip" data-clip-url="${escapeHtml(clip.url)}">
          ${clip.thumbnailUrl ? `<img class="fav-clip-thumb" src="${escapeHtml(clip.thumbnailUrl)}" alt="" loading="lazy" />` : ""}
          <span class="fav-clip-title">${escapeHtml(clip.title)}</span>
          <button type="button" class="fav-remove fav-remove-clip" aria-label="Remove from favorites">&times;</button>
        </div>`).join("");
      return `
        <div class="fav-game" data-game="${escapeHtml(game)}">
          <div class="fav-game-header">
            <span class="fav-chevron">&#9654;</span>
            <span class="fav-game-name">${escapeHtml(game)}</span>
            <span class="fav-game-count">${clips.length}</span>
          </div>
          <div class="fav-game-children">${clipHtml}</div>
        </div>`;
    }).join("");
    return `
      <div class="fav-channel" data-channel="${escapeHtml(channel)}">
        <div class="fav-channel-header">
          <span class="fav-chevron">&#9654;</span>
          <span class="fav-channel-name">${escapeHtml(channel)}</span>
          <span class="fav-channel-count">${channelClipCount}</span>
        </div>
        <div class="fav-channel-children">${gameHtml}</div>
      </div>`;
  }).join("");
}
