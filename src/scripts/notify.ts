// Non-blocking terminal-style confirm banner 
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

    const prompt = document.createElement("span");
    prompt.className = "notify-prompt";
    prompt.textContent = ">_";

    const msg = document.createElement("span");
    msg.className = "notify-msg";
    msg.textContent = message;

    const actions = document.createElement("div");
    actions.className = "notify-actions";

    const yesBtn = document.createElement("button");
    yesBtn.className = "notify-yes";
    yesBtn.textContent = `[${yesText}]`;

    const noBtn = document.createElement("button");
    noBtn.className = "notify-no";
    noBtn.textContent = `[${noText}]`;

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    banner.appendChild(prompt);
    banner.appendChild(msg);
    banner.appendChild(actions);
    document.body.appendChild(banner);

    // Animate in on next frame
    requestAnimationFrame(() => banner.classList.add("notify-visible"));

    const cleanup = (result: boolean) => {
      banner.classList.remove("notify-visible");
      setTimeout(() => banner.remove(), 350);
      resolve(result);
    };

    yesBtn.addEventListener("click", () => cleanup(true));
    noBtn.addEventListener("click", () => cleanup(false));
  });
}

/** Show a passive (non-interactive) status message that auto-dismisses. */
export function terminalToast(message: string, durationMs = 3000): void {
  document.querySelector(".notify-banner")?.remove();

  const banner = document.createElement("div");
  banner.className = "notify-banner notify-toast";

  const prompt = document.createElement("span");
  prompt.className = "notify-prompt";
  prompt.textContent = "//";

  const msg = document.createElement("span");
  msg.className = "notify-msg";
  msg.textContent = message;

  banner.appendChild(prompt);
  banner.appendChild(msg);
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("notify-visible"));
  setTimeout(() => {
    banner.classList.remove("notify-visible");
    setTimeout(() => banner.remove(), 350);
  }, durationMs);
}

let lastRateLimitToast = 0;
/** Debounced toast for rate-limit messages — collapses bursts of 429s
 *  into a single visible message so the UI doesn't flash. */
export function rateLimitToast(message: string): void {
  const now = Date.now();
  if (now - lastRateLimitToast < 1500) return;
  lastRateLimitToast = now;
  terminalToast(message, 2000);
}
