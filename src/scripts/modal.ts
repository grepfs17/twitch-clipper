import { elements } from "./dom";

let currentClipUrl = "";

function getClipEmbedUrl(clipUrl: string): string {
    const slug = clipUrl.split("/").pop() || "";
    const parent = window.location.hostname;
    return `https://clips.twitch.tv/embed?clip=${slug}&parent=${parent}&autoplay=true`;
}

export function openClipModal(clip: any) {
    if (!elements.modal || !elements.modalIframe || !elements.modalTitle || !elements.modalGame || !elements.modalDate) return;

    currentClipUrl = clip.url;
    const date = new Date(clip.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    elements.modalTitle.textContent = clip.title;
    elements.modalGame.textContent = clip.game_name;
    elements.modalDate.textContent = date;
    elements.modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    setTimeout(() => {
        elements.modalIframe!.src = getClipEmbedUrl(clip.url);
    }, 250);
}

function closeClipModal() {
    if (!elements.modal || !elements.modalIframe) return;
    elements.modal.classList.add("hidden");
    elements.modalIframe.src = "";
    document.body.style.overflow = "";
    currentClipUrl = "";
}

export function initModal() {
    elements.modalCloseBtn?.addEventListener("click", closeClipModal);

    elements.modal?.addEventListener("click", (e) => {
        if (e.target === elements.modal) closeClipModal();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeClipModal();
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
            setTimeout(() => { btn.innerHTML = original; }, 2000);
        } catch {
            const btn = elements.modalCopyBtn!;
            btn.textContent = "Failed to copy";
            setTimeout(() => { btn.textContent = "Copy Clip Link"; }, 2000);
        }
    });
}
