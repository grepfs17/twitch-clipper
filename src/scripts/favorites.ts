import { elements } from "./dom";
import type { TwitchClip } from "./types";

const STORAGE_KEY = "tc-favorites";

export interface FavoriteClip {
  url: string;
  channel: string;
  game: string;
  title: string;
  thumbnailUrl?: string;
}

export function resetFavoritesCache() {
  _cacheLoaded = false;
  _cachedFavorites = [];
  _favUrls.clear();
}

let _cachedFavorites: FavoriteClip[] = [];
const _favUrls = new Set<string>();
let _cacheLoaded = false;

function loadFavorites(): FavoriteClip[] {
  if (_cacheLoaded) return _cachedFavorites;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cachedFavorites = raw ? JSON.parse(raw) : [];
  } catch {
    _cachedFavorites = [];
  }
  _favUrls.clear();
  for (const f of _cachedFavorites) _favUrls.add(f.url);
  _cacheLoaded = true;
  return _cachedFavorites;
}

function saveFavorites(list: FavoriteClip[]) {
  _cachedFavorites = list;
  _favUrls.clear();
  for (const f of list) _favUrls.add(f.url);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function isFavorite(clipUrl: string): boolean {
  loadFavorites();
  return _favUrls.has(clipUrl);
}

function addFavorite(clip: FavoriteClip) {
  let list = loadFavorites();
  if (!list.some((f) => f.url === clip.url)) {
    list = [clip, ...list];
    saveFavorites(list);
  }
  renderFavorites();
  updateButtonCount();
}

function removeFavorite(clipUrl: string) {
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

export function updateButtonCount() {
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

  const grid = document.getElementById("favoritesGrid");
  if (grid) {
    grid.addEventListener("click", handleFavoritesGridClick);
  }
  renderFavorites();
  updateButtonCount();
}

function toggleClosestCollapse(
  target: HTMLElement,
  headerSelector: string,
  nodeSelector: string,
): boolean {
  const header = target.closest(headerSelector);
  if (!header) return false;
  const node = header.closest(nodeSelector);
  if (node) (node as HTMLElement).classList.toggle("collapsed");
  return true;
}

function handleFavRemoveClick(target: HTMLElement): boolean {
  const removeBtn = target.closest(".fav-remove") as HTMLButtonElement | null;
  if (!removeBtn) return false;
  if (removeBtn.classList.contains("fav-remove-clip")) {
    const clipUrl = removeBtn
      .closest(".fav-clip")
      ?.getAttribute("data-clip-url");
    if (clipUrl) removeFavorite(clipUrl);
  }
  return true;
}

async function handleFavClipClick(target: HTMLElement): Promise<boolean> {
  const clipItem = target.closest(".fav-clip") as HTMLElement | null;
  if (!clipItem) return false;
  const clipUrl = clipItem.getAttribute("data-clip-url");
  if (!clipUrl) return true;
  try {
    const r = await fetch(`/api/clips/lookup?url=${encodeURIComponent(clipUrl)}`);
    const data: { clip?: TwitchClip } = await r.json();
    if (data.clip) {
      window.dispatchEvent(
        new CustomEvent("fav:openClip", { detail: data.clip }),
      );
    }
  } catch {
    /* ignore */
  }
  return true;
}

async function handleFavoritesGridClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (handleFavRemoveClick(target)) return;
  if (toggleClosestCollapse(target, ".fav-channel-header", ".fav-channel")) return;
  if (toggleClosestCollapse(target, ".fav-game-header", ".fav-game")) return;
  await handleFavClipClick(target);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  grid.innerHTML = channels
    .map((channel) => {
      const games = Object.keys(tree[channel]).sort((a, b) =>
        a.localeCompare(b),
      );
      const channelClipCount = games.reduce(
        (sum, g) => sum + tree[channel][g].length,
        0,
      );
      const gameHtml = games
        .map((game) => {
          const clips = tree[channel][game];
          const clipHtml = clips
            .map(
              (clip) => `
        <div class="fav-clip" data-clip-url="${escapeHtml(clip.url)}">
          ${clip.thumbnailUrl ? `<img class="fav-clip-thumb" src="${escapeHtml(clip.thumbnailUrl)}" alt="" loading="lazy" />` : ""}
          <span class="fav-clip-title">${escapeHtml(clip.title)}</span>
          <button type="button" class="fav-remove fav-remove-clip" aria-label="Remove from favorites">&times;</button>
        </div>`,
            )
            .join("");
          return `
        <div class="fav-game" data-game="${escapeHtml(game)}">
          <div class="fav-game-header">
            <span class="fav-chevron">&#9654;</span>
            <span class="fav-game-name">${escapeHtml(game)}</span>
            <span class="fav-game-count">${clips.length}</span>
          </div>
          <div class="fav-game-children">${clipHtml}</div>
        </div>`;
        })
        .join("");
      return `
      <div class="fav-channel" data-channel="${escapeHtml(channel)}">
        <div class="fav-channel-header">
          <span class="fav-chevron">&#9654;</span>
          <span class="fav-channel-name">${escapeHtml(channel)}</span>
          <span class="fav-channel-count">${channelClipCount}</span>
        </div>
        <div class="fav-channel-children">${gameHtml}</div>
      </div>`;
    })
    .join("");
}
