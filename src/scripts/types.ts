// Shared client-side type definitions. Kept here so clip-shape changes
// (e.g. adding a field) only have to ripple from one place.

export interface TwitchClip {
  id: string;
  url: string;
  title: string;
  creator_name: string;
  broadcaster_name: string;
  game_id: string;
  game_name: string;
  thumbnail_url: string;
  view_count: number;
  created_at: string;
  duration: number;
}

export interface TwitchClipsResponse {
  clips: TwitchClip[];
  pagination?: { cursor?: string };
}

export interface TwitchBudget {
  remaining: number | null;
  resetAt: number | null;
}
