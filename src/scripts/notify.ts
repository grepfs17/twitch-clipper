// ── Non-blocking terminal-style confirm banner ────────────────────────────────
// Returns a Promise<boolean> — resolves when user clicks Yes or No.

export function terminalConfirm(
  message: string,
  yesText = "YES",
  noText = "NO",
): Promise<boolean> {
  return new Promise((resolve) => {
    // Remove any existing banner first
    document.querySelector(".notify-banner")?.remove();

    const banner = document.createElement("div");
    banner.className = "notify-banner";
    banner.innerHTML = `
            <span class="notify-prompt">&gt;_</span>
            <span class="notify-msg">${message}</span>
            <div class="notify-actions">
                <button class="notify-yes">[${yesText}]</button>
                <button class="notify-no">[${noText}]</button>
            </div>
        `;
    document.body.appendChild(banner);

    // Animate in on next frame
    requestAnimationFrame(() => banner.classList.add("notify-visible"));

    const cleanup = (result: boolean) => {
      banner.classList.remove("notify-visible");
      setTimeout(() => banner.remove(), 350);
      resolve(result);
    };

    banner
      .querySelector<HTMLButtonElement>(".notify-yes")!
      .addEventListener("click", () => cleanup(true));
    banner
      .querySelector<HTMLButtonElement>(".notify-no")!
      .addEventListener("click", () => cleanup(false));
  });
}

/** Show a passive (non-interactive) status message that auto-dismisses. */
export function terminalToast(message: string, durationMs = 3000): void {
  document.querySelector(".notify-banner")?.remove();

  const banner = document.createElement("div");
  banner.className = "notify-banner notify-toast";
  banner.innerHTML = `
        <span class="notify-prompt">//</span>
        <span class="notify-msg">${message}</span>
    `;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("notify-visible"));
  setTimeout(() => {
    banner.classList.remove("notify-visible");
    setTimeout(() => banner.remove(), 350);
  }, durationMs);
}
