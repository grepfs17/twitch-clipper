import { openClipModal } from "./modal";

const input = document.getElementById("clipUrlInput") as HTMLInputElement;
const btn = document.getElementById("clipUrlBtn") as HTMLButtonElement;

async function openClipFromUrl(clipUrl: string) {
  btn.disabled = true;
  btn.textContent = "...";

  try {
    const res = await fetch(
      `/api/clip/lookup?url=${encodeURIComponent(clipUrl)}`,
    );
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to load clip");
      return;
    }
    const data = await res.json();
    openClipModal(data.clip);
  } catch {
    alert("Failed to load clip");
  } finally {
    btn.disabled = false;
    btn.textContent = "OPEN";
  }
}

btn.addEventListener("click", () => {
  const val = input.value.trim();
  if (val) openClipFromUrl(val);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const val = input.value.trim();
    if (val) openClipFromUrl(val);
  }
});
