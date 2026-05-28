const STORAGE_KEY = "tc-recent";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function typeText(el: HTMLElement, text: string) {
  for (let i = 0; i <= text.length; i++) {
    el.textContent = text.slice(0, i);
    await sleep(80 + Math.random() * 60);
  }
}

async function deleteText(el: HTMLElement) {
  const current = el.textContent || "";
  for (let i = current.length; i >= 0; i--) {
    el.textContent = current.slice(0, i);
    await sleep(40 + Math.random() * 30);
  }
}

async function cycle(el: HTMLElement) {
  const recent = loadRecent();
  if (recent.length === 0) {
    el.textContent = "";
    return;
  }

  while (true) {
    const name = recent[Math.floor(Math.random() * recent.length)];
    await typeText(el, name);
    await sleep(2000);
    await deleteText(el);
    await sleep(800);
  }
}

export function initTypewriter() {
  const el = document.getElementById("typewriterText");
  if (el) cycle(el);
}
