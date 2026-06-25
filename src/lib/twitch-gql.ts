import { jsonError } from "./utils";
export { jsonError };

// This is a public key used by Twitch
const TWITCH_GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

const SHARE_CLIP_QUERY = {
  operationName: "ShareClipRenderStatus",
  extensions: {
    persistedQuery: {
      version: 1,
      sha256Hash:
        "0a02bb974443b576f5579aab0fef1d4b7f44e58a8a256f0c5adfead0db70640f",
    },
  },
};

export const CLIP_SLUG_REGEX =
  /^(?:https?:\/\/)?(?:clips\.twitch\.tv\/|.*clip\/)([\w-]+)/i;

export function extractClipSlug(clipUrl: string): string | null {
  const match = clipUrl.match(CLIP_SLUG_REGEX);
  return match ? match[1] : null;
}

export async function getClipMetadata(slug: string): Promise<any> {
  const res = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: { "Client-Id": TWITCH_GQL_CLIENT_ID },
    body: JSON.stringify([{ ...SHARE_CLIP_QUERY, variables: { slug } }]),
  });

  if (!res.ok) {
    throw new Error(`GQL request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as Array<{ data?: { clip?: unknown } }>;
  return data[0]?.data?.clip || null;
}
