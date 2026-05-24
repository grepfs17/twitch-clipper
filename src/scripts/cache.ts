// ── IndexedDB cache for full clip libraries ───────────────────────────────────

const DB_NAME = "twitch-clip-explorer";
const STORE = "channels";
const DB_VERSION = 1;

export interface CacheEntry {
  channel: string; // normalized lowercase key
  clips: any[];
  savedAt: string; // ISO
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "channel" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCache(channel: string): Promise<CacheEntry | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(channel.toLowerCase());
      req.onsuccess = () => resolve((req.result as CacheEntry) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveCache(channel: string, clips: any[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const entry: CacheEntry = {
      channel: channel.toLowerCase(),
      clips,
      savedAt: new Date().toISOString(),
    };
    const req = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearCache(channel: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .delete(channel.toLowerCase());
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
