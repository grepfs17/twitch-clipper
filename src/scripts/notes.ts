const STORAGE_KEY = "tc-notes";

function loadAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getNote(clipUrl: string): string {
  return loadAll()[clipUrl] || "";
}

export function saveNote(clipUrl: string, text: string) {
  const all = loadAll();
  if (text.trim()) {
    all[clipUrl] = text;
  } else {
    delete all[clipUrl];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
