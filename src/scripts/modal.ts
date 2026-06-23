import { elements } from "./dom";
import { isFavorite, toggleFavorite, type FavoriteClip } from "./favorites";
import { getNote, saveNote } from "./notes";
import type { TwitchClip } from "./types";

let currentClipUrl = "";
let currentClipMeta: FavoriteClip | null = null;
let isDownloading = false;

interface FormatOption {
  id: string;
  label: string;
  group: "landscape" | "portrait";
}

function getClipEmbedUrl(clipUrl: string): string {
  const slug = clipUrl.split("/").pop() || "";
  const parent = window.location.hostname;
  return `https://clips.twitch.tv/embed?clip=${slug}&parent=${parent}&autoplay=true&muted=true`;
}

function sendEmbedCommand(func: string, args: any[] = []) {
  const iframe = elements.modalIframe;
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "https://clips.twitch.tv",
  );
}
function saveBlob(blob: Blob, response: Response) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?([^"\n]+)/i);
  const filename = filenameMatch
    ? decodeURIComponent(filenameMatch[1])
    : makeFilename(currentClipMeta?.title || slugFromUrl(currentClipUrl));

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function onEmbedReady(cb: () => void) {
  const handler = (e: MessageEvent) => {
    try {
      const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if (data.event === "ready") {
        window.removeEventListener("message", handler);
        cb();
      }
    } catch {}
  };
  window.addEventListener("message", handler);
}

function initQualitySelector() {
  const trigger = elements.qualitySelectTrigger;
  const options = elements.qualitySelectOptions;
  if (!elements.qualitySelect || !trigger || !options) return;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = options.classList.contains("open");
    closeAllSelects();
    if (!isOpen) {
      options.classList.add("open");
      trigger.classList.add("open");
    }
  });
}

function closeAllSelects() {
  elements.qualitySelectOptions?.classList.remove("open");
  elements.qualitySelectTrigger?.classList.remove("open");
}

function storeClipUrl(url: string) {
  currentClipUrl = url;
  if (elements.modal) elements.modal.dataset.clipUrl = url;
  if (elements.modalOpenBtn) elements.modalOpenBtn.href = url;
  updateModalFavBtn();
}

export function openClipModal(clip: TwitchClip) {
  if (!modalElementsReady()) return;

  currentClipMeta = buildClipMeta(clip);
  storeClipUrl(clip.url);

  const date = formatClipDate(clip.created_at);
  populateModalContent(clip, date);
  setModalNotesSection(clip.url);
  showModalAndIframe(clip);
  fetchAndPopulateFormats(clip.url);
}

function modalElementsReady(): boolean {
  return !!(
    elements.modal &&
    elements.modalIframe &&
    elements.modalTitle &&
    elements.modalGame &&
    elements.modalDate
  );
}

function buildClipMeta(clip: TwitchClip): FavoriteClip {
  return {
    url: clip.url,
    channel: clip.broadcaster_name,
    game: clip.game_name,
    title: clip.title,
    thumbnailUrl: clip.thumbnail_url,
  };
}

function formatClipDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function populateModalContent(clip: TwitchClip, date: string) {
  elements.modalTitle!.textContent = clip.title;
  if (elements.modalCreator)
    elements.modalCreator.textContent = clip.creator_name;
  elements.modalGame!.textContent = clip.game_name;
  elements.modalDate!.textContent = date;
}

function setModalNotesSection(clipUrl: string) {
  if (!elements.modalNotesSection) return;
  const hasNotes = !!getNote(clipUrl);
  elements.modalNotesSection.classList.toggle("has-notes", hasNotes);
  elements.modalNotesSection.classList.remove("open");
  if (elements.modalNotes) elements.modalNotes.value = getNote(clipUrl);
}

function showModalAndIframe(clip: TwitchClip) {
  elements.modal!.classList.remove("hidden");
  if (
    elements.favoritesModal &&
    !elements.favoritesModal.classList.contains("hidden")
  ) {
    elements.favoritesModal.style.zIndex = "999";
  }
  document.body.style.overflow = "hidden";

  if (elements.modalSpinner) elements.modalSpinner.style.display = "flex";
  if (elements.modalIframe) elements.modalIframe.style.opacity = "0";

  const hideSpinner = () => {
    if (elements.modalSpinner) elements.modalSpinner.style.display = "none";
    if (elements.modalIframe) elements.modalIframe.style.opacity = "1";
  };

  elements.modalIframe!.onload = hideSpinner;

  onEmbedReady(() => {
    sendEmbedCommand("setQuality", ["chunked"]);
    hideSpinner();
  });
  elements.modalIframe!.src = getClipEmbedUrl(clip.url);
}

async function fetchAndPopulateFormats(clipUrl: string) {
  if (!elements.qualitySelectOptions) return;

  resetQualitySelector();

  const url = `/api/clips/formats?url=${encodeURIComponent(clipUrl)}`;
  let attempt = 0;
  const maxAttempts = 3;
  let lastErr: unknown = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") || "1");
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
        // Out of retries — leave the dropdown at "Best Quality" but
        // surface the error in the console so it's debuggable.
        console.warn(
          "Qualities fetch rate-limited; using default. Retry-After:",
          retryAfter,
        );
        return;
      }
      if (!res.ok) {
        console.warn("Qualities fetch failed:", res.status);
        return;
      }
      const data: { options?: FormatOption[] } = await res.json();
      if (data.options?.length) {
        populateQualityOptions(data.options);
      }
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
        continue;
      }
      console.warn("Qualities fetch error:", lastErr);
      return;
    }
  }
}

function resetQualitySelector() {
  if (!elements.qualitySelect || !elements.qualitySelectTrigger) return;
  elements.qualitySelect.value = "best";
  elements.qualitySelectTrigger.textContent = "Best Quality";
}

function populateQualityOptions(options: FormatOption[]) {
  if (!elements.qualitySelectOptions) return;

  elements.qualitySelectOptions.innerHTML = "";

  let hasPortrait = false;

  for (const opt of options) {
    if (opt.group === "portrait" && !hasPortrait) {
      hasPortrait = true;
      const header = document.createElement("li");
      header.className = "optgroup-header";
      header.textContent = "Portrait Mode";
      elements.qualitySelectOptions.appendChild(header);
    }

    const li = document.createElement("li");
    li.setAttribute("data-value", opt.id);
    li.textContent = opt.label;
    li.addEventListener("click", () => {
      if (!elements.qualitySelect || !elements.qualitySelectTrigger) return;
      elements.qualitySelect.value = opt.id;
      elements.qualitySelectTrigger.textContent = opt.label;
      closeAllSelects();
    });
    elements.qualitySelectOptions.appendChild(li);
  }
}

function closeClipModal() {
  if (!elements.modal || !elements.modalIframe) return;
  elements.modal.classList.add("hidden");
  elements.modalIframe.src = "";
  elements.modalIframe.onload = null;
  if (elements.modalSpinner) elements.modalSpinner.style.display = "none";
  if (elements.modalIframe) elements.modalIframe.style.opacity = "1";
  if (
    elements.favoritesModal &&
    !elements.favoritesModal.classList.contains("hidden")
  ) {
    elements.favoritesModal.style.zIndex = "";
  } else {
    document.body.style.overflow = "";
  }
  currentClipUrl = "";
  currentClipMeta = null;
  if (elements.modal) delete elements.modal.dataset.clipUrl;
  if (elements.modalOpenBtn) elements.modalOpenBtn.removeAttribute("href");
}

async function downloadClip(quality: string) {
  if (!currentClipUrl || isDownloading) return;

  const btn = elements.modalDownloadBtn;
  const progressEl = elements.downloadProgress;
  const progressFill = elements.downloadProgressFill;
  const progressText = elements.downloadProgressText;
  if (!btn || !progressEl || !progressFill || !progressText) {
    console.warn("Download UI elements are missing from the DOM");
    return;
  }

  isDownloading = true;
  const originalHTML = btn.innerHTML;
  setDownloadButtonBusy(btn);
  showProgressBar(progressEl, progressFill, progressText);

  try {
    const response = await fetch(
      buildDownloadUrl(currentClipUrl, quality, currentClipMeta?.title),
    );
    if (!response.ok) throw new Error(await extractErrorMessage(response));

    const total = parseInt(response.headers.get("content-length") || "0") || 0;
    const blob = await readResponseAsBlob(
      response,
      total,
      progressFill,
      progressText,
    );
    saveBlob(blob, response);

    progressFill.style.width = "100%";
    progressText.textContent = "100%";
  } catch (err: any) {
    showDownloadError(btn, originalHTML, err.message, progressEl);
    return;
  }

  showDownloadSuccess(btn, originalHTML, progressEl);
}

function buildDownloadUrl(clipUrl: string, quality: string, title?: string) {
  const params = new URLSearchParams({
    url: clipUrl,
    quality,
    title: title || "",
  });
  return `/api/clips/download?${params.toString()}`;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      return JSON.parse(text).error || text.slice(0, 200) || "Download failed";
    } catch {
      return text.slice(0, 200) || "Download failed";
    }
  } catch {
    return `Server error ${response.status}`;
  }
}

async function readResponseAsBlob(
  response: Response,
  total: number,
  progressFill: HTMLElement,
  progressText: HTMLElement,
): Promise<Blob> {
  if (total > 0 && response.body) {
    const chunks = await streamWithProgress(
      response.body.getReader(),
      total,
      progressFill,
      progressText,
    );
    return new Blob(chunks as BlobPart[]);
  }
  return await response.blob();
}

async function streamWithProgress(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  total: number,
  progressFill: HTMLElement,
  progressText: HTMLElement,
): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.length;
    const pct = Math.round((downloaded / total) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${pct}%`;
  }
  return chunks;
}

const SPINNER_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="animation: spin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;
const ERROR_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
const CHECK_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

function setDownloadButtonBusy(btn: HTMLButtonElement) {
  btn.innerHTML = `${SPINNER_SVG} Downloading...`;
  btn.disabled = true;
}

function showProgressBar(
  progressEl: HTMLElement,
  progressFill: HTMLElement,
  progressText: HTMLElement,
) {
  progressEl.style.display = "flex";
  progressFill.style.width = "0%";
  progressText.textContent = "0%";
}

function showDownloadError(
  btn: HTMLButtonElement,
  originalHTML: string,
  message: string,
  progressEl: HTMLElement,
) {
  btn.innerHTML = `${ERROR_SVG} ${message || "Error"}`;
  btn.disabled = false;
  setTimeout(() => {
    btn.innerHTML = originalHTML;
  }, 4000);
  isDownloading = false;
  progressEl.style.display = "none";
}

function showDownloadSuccess(
  btn: HTMLButtonElement,
  originalHTML: string,
  progressEl: HTMLElement,
) {
  btn.innerHTML = `${CHECK_SVG} Downloaded!`;
  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    isDownloading = false;
    progressEl.style.display = "none";
  }, 2000);
}

function updateModalFavBtn() {
  const url = currentClipUrl || elements.modal?.dataset.clipUrl;
  if (!elements.modalFavBtn || !url) return;
  const icon = elements.modalFavBtn.querySelector(".fav-icon") as SVGElement;
  if (isFavorite(url)) {
    icon.setAttribute("fill", "var(--amber)");
    elements.modalFavBtn.classList.add("active");
  } else {
    icon.setAttribute("fill", "currentColor");
    elements.modalFavBtn.classList.remove("active");
  }
}

function slugFromUrl(url: string): string {
  const match = url.match(/(?:clips\.twitch\.tv\/|.*clip\/)([\w-]+)/i);
  return match ? match[1] : "clip";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").trim();
}

function makeFilename(name: string): string {
  return sanitizeFilename(name) + ".mp4";
}

export function initModal() {
  elements.modalCloseBtn?.addEventListener("click", closeClipModal);

  elements.modal?.addEventListener("click", (e) => {
    if (e.target === elements.modal) closeClipModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (elements.modal && !elements.modal.classList.contains("hidden")) {
        closeClipModal();
      } else if (
        elements.favoritesModal &&
        !elements.favoritesModal.classList.contains("hidden")
      ) {
        elements.favoritesModal.classList.add("hidden");
        document.body.style.overflow = "";
      }
    }
  });

  document.addEventListener("click", () => {
    closeAllSelects();
  });

  elements.qualitySelectTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  elements.qualitySelectOptions?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  elements.modalFavBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const url = elements.modal?.dataset.clipUrl;
    if (!url || !currentClipMeta) return;
    toggleFavorite(currentClipMeta);
    updateModalFavBtn();
  });

  elements.modalCopyBtn?.addEventListener("click", async () => {
    if (!currentClipUrl) return;
    try {
      await navigator.clipboard.writeText(currentClipUrl);
      const btn = elements.modalCopyBtn!;
      const original = btn.innerHTML;
      btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                Copied!
            `;
      setTimeout(() => {
        btn.innerHTML = original;
      }, 2000);
    } catch {
      const btn = elements.modalCopyBtn!;
      btn.textContent = "Failed to copy";
      setTimeout(() => {
        btn.textContent = "Copy Clip Link";
      }, 2000);
    }
  });

  elements.modalDownloadBtn?.addEventListener("click", () => {
    const quality = elements.qualitySelect?.value || "best";
    downloadClip(quality);
  });

  initQualitySelector();

  elements.modalNotes?.addEventListener("input", () => {
    const notesEl = elements.modalNotes;
    if (!notesEl) return;
    if (currentClipUrl) {
      saveNote(currentClipUrl, notesEl.value);
    }
    if (elements.modalNotesSection) {
      elements.modalNotesSection.classList.toggle(
        "has-notes",
        !!notesEl.value.trim(),
      );
    }
  });

  elements.modalNotesToggle?.addEventListener("click", () => {
    elements.modalNotesSection?.classList.toggle("open");
  });

  const videoWrapper = elements.modalIframe?.closest(".modal-video-wrapper");
  videoWrapper?.addEventListener("click", () => sendEmbedCommand("unMute"));

  window.addEventListener("fav:openClip", ((e: CustomEvent) => {
    openClipModal(e.detail);
  }) as EventListener);
}

// @internal — exported for unit tests. Not part of the public API.
export const __testing = {
  slugFromUrl,
  sanitizeFilename,
  makeFilename,
  formatClipDate,
};
