export async function fetchClips(channel: string, timeRange = "all", after = "") {
    try {
        const res = await fetch(
            `/api/clips?channel=${encodeURIComponent(channel)}&timeRange=${timeRange}&after=${after}`,
        );
        if (!res.ok) throw new Error("Failed to fetch clips");
        return await res.json();
    } catch (err) {
        console.error(err);
        return null;
    }
}
