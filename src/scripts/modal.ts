import { elements } from "./dom";
import { isFavorite, toggleFavorite, type FavoriteClip } from "./favorites";
import { getNote, saveNote } from "./notes";

let currentClipUrl = "";
let currentClipMeta: FavoriteClip | null = null;
let isDownloading = false;

const qualityLabels: Record<string, string> = {
  best: "Best Quality",
  "1080p": "1080p",
  "720p": "720p",
  "480p": "480p",
  "360p": "360p",
  "160p": "160p",
  "portrait-1080p": "1080p Portrait",
  "portrait-720p": "720p Portrait",
  "portrait-480p": "480p Portrait",
  "portrait-360p": "360p Portrait",
  "portrait-160p": "160p Portrait",
};

function getClipEmbedUrl(clipUrl: string): string {
  const slug = clipUrl.split("/").pop() || "";
  const parent = window.location.hostname;
  return `https://clips.twitch.tv/embed?clip=${slug}&parent=${parent}&autoplay=true&muted=true`;
}

function sendEmbedCommand(func: string, args: any[] = []) {
  const iframe = elements.modalIframe;
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
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
  if (
    !elements.qualitySelectTrigger ||
    !elements.qualitySelect ||
    !elements.qualitySelectOptions
  )
    return;

  elements.qualitySelectTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = elements.qualitySelectOptions.classList.contains("open");
    closeAllSelects();
    if (!isOpen) {
      elements.qualitySelectOptions.classList.add("open");
      elements.qualitySelectTrigger.classList.add("open");
    }
  });

  elements.qualitySelectOptions.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      const value = li.getAttribute("data-value");
      if (!value) return;

      elements.qualitySelect.value = value;
      elements.qualitySelectTrigger.textContent = qualityLabels[value] || value;

      elements.qualitySelectOptions.classList.remove("open");
      elements.qualitySelectTrigger.classList.remove("open");
    });
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

export function openClipModal(clip: any) {
  if (
    !elements.modal ||
    !elements.modalIframe ||
    !elements.modalTitle ||
    !elements.modalGame ||
    !elements.modalDate
  )
    return;

  currentClipMeta = {
    url: clip.url,
    channel: clip.broadcaster_name,
    game: clip.game_name,
    title: clip.title,
    thumbnailUrl: clip.thumbnail_url,
  };
  storeClipUrl(clip.url);
  const date = new Date(clip.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  elements.modalTitle.textContent = clip.title;
  if (elements.modalCreator)
    elements.modalCreator.textContent = clip.creator_name;
  elements.modalGame.textContent = clip.game_name;
  elements.modalDate.textContent = date;
  if (elements.modalNotes) {
    elements.modalNotes.value = getNote(clip.url);
  }
  if (elements.modalNotesSection) {
    const hasNotes = !!getNote(clip.url);
    elements.modalNotesSection.classList.toggle("has-notes", hasNotes);
    elements.modalNotesSection.classList.remove("open");
  }
  elements.modal.classList.remove("hidden");
  if (elements.favoritesModal && !elements.favoritesModal.classList.contains("hidden")) {
    elements.favoritesModal.style.zIndex = "999";
  }
  document.body.style.overflow = "hidden";
  onEmbedReady(() => {
    sendEmbedCommand("setQuality", ["chunked"]);
  });
  elements.modalIframe!.src = getClipEmbedUrl(clip.url);
}

function closeClipModal() {
  if (!elements.modal || !elements.modalIframe) return;
  elements.modal.classList.add("hidden");
  elements.modalIframe.src = "";
  elements.modalIframe.onload = null;
  if (elements.favoritesModal && !elements.favoritesModal.classList.contains("hidden")) {
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
  isDownloading = true;

  const btn = elements.modalDownloadBtn!;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="animation: spin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
        Downloading...
    `;
  btn.disabled = true;

  const progressEl = elements.downloadProgress!;
  const progressFill = elements.downloadProgressFill!;
  const progressText = elements.downloadProgressText!;
  progressEl.style.display = "flex";
  progressFill.style.width = "0%";
  progressText.textContent = "0%";

  try {
    const response = await fetch(
      `/api/clips/download?url=${encodeURIComponent(currentClipUrl)}&quality=${encodeURIComponent(quality)}`,
    );

    if (!response.ok) {
      let errorMessage = "Download failed";
      try {
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = text.slice(0, 200) || errorMessage;
        }
      } catch {
        errorMessage = `Server error ${response.status}`;
      }
      throw new Error(errorMessage);
    }

    const contentLength = response.headers.get("content-length");
    const total = contentLength ? parseInt(contentLength) : 0;
    let downloaded = 0;

    if (total > 0 && response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        downloaded += value.length;
        const pct = Math.round((downloaded / total) * 100);
        progressFill.style.width = `${pct}%`;
        progressText.textContent = `${pct}%`;
      }

      const blob = new Blob(chunks as BlobPart[]);
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?(.+)"?$/i);
      const filename = filenameMatch
        ? filenameMatch[1]
        : `${slugFromUrl(currentClipUrl)}.mp4`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?(.+)"?$/i);
      const filename = filenameMatch
        ? filenameMatch[1]
        : `${slugFromUrl(currentClipUrl)}.mp4`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    progressFill.style.width = "100%";
    progressText.textContent = "100%";
  } catch (err: any) {
    const btn2 = elements.modalDownloadBtn!;
    btn2.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            ${err.message || "Error"}
        `;
    btn2.disabled = false;
    setTimeout(() => {
      btn2.innerHTML = originalHTML;
    }, 4000);
    isDownloading = false;
    progressEl.style.display = "none";
    return;
  }

  btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        Downloaded!
    `;
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

export function initModal() {
  elements.modalCloseBtn?.addEventListener("click", closeClipModal);

  elements.modal?.addEventListener("click", (e) => {
    if (e.target === elements.modal) closeClipModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (
        elements.modal &&
        !elements.modal.classList.contains("hidden")
      ) {
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
    if (currentClipUrl) {
      saveNote(currentClipUrl, elements.modalNotes.value);
    }
    if (elements.modalNotesSection) {
      elements.modalNotesSection.classList.toggle("has-notes", !!elements.modalNotes.value.trim());
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
