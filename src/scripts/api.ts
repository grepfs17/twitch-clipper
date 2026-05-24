export async function fetchClips(
  channel: string,
  timeRange = "all",
  after = "",
  startedAt?: string,
  endedAt?: string,
) {
  try {
    let url = `/api/clips?channel=${encodeURIComponent(channel)}&timeRange=${timeRange}&after=${after}`;
    if (startedAt) url += `&startedAt=${encodeURIComponent(startedAt)}`;
    if (endedAt) url += `&endedAt=${encodeURIComponent(endedAt)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch clips");
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}
