import { elements } from "./dom";
import { clearCache } from "./cache";

const STORAGE_KEY = "tc-recent";
const MAX_ITEMS = 10;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addRecent(channel: string) {
  let list = loadRecent();
  list = [channel, ...list.filter((c) => c !== channel)];
  if (list.length > MAX_ITEMS) list = list.slice(0, MAX_ITEMS);
  saveRecent(list);
  renderRecent();
}

async function removeRecent(channel: string) {
  let list = loadRecent();
  list = list.filter((c) => c !== channel);
  saveRecent(list);
  renderRecent();
  await clearCache(channel);
}

function renderRecent() {
  const list = loadRecent();
  const container = elements.recentSearches;
  const ul = elements.recentList;
  if (!container || !ul) return;

  if (list.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  ul.innerHTML = list
    .map(
      (ch) => `
                <li class="recent-item">
                    <button type="button" class="recent-channel" data-channel="${ch}">${ch}</button>
                    <button type="button" class="recent-remove" data-channel="${ch}" aria-label="Remove ${ch}">&times;</button>
                </li>
            `,
    )
    .join("");
}

export function initRecent() {
  renderRecent();

  elements.recentList?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const channel = target.dataset.channel;
    if (!channel) return;

    if (target.classList.contains("recent-remove")) {
      removeRecent(channel);
    } else if (target.classList.contains("recent-channel")) {
      if (elements.channelInput) elements.channelInput.value = channel;
      elements.searchBtn?.setAttribute("data-skip-cache-confirm", "1");
      elements.searchBtn?.click();
    }
  });
}
