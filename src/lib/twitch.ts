
// ── Token cache ────────────────────────────────────────────────────────────────
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0; // unix ms

export async function getAccessToken() {
  const clientId = import.meta.env.TWITCH_CLIENT_ID;
  const clientSecret = import.meta.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Twitch credentials not found in environment variables');
  }

  // Return cached token if still valid (with 60s buffer)
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to get access token: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  _cachedToken = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return _cachedToken!;
}


export async function getBroadcasterId(login: string, token: string) {
  const clientId = import.meta.env.TWITCH_CLIENT_ID;

  const response = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }

  const data = await response.json();
  if (data.data.length === 0) {
    return null;
  }

  return data.data[0].id;
}

export async function getClips(broadcasterId: string, token: string, options: {
  started_at?: string,
  ended_at?: string,
  first?: number,
  after?: string
} = {}) {
  const clientId = import.meta.env.TWITCH_CLIENT_ID;
  const url = new URL('https://api.twitch.tv/helix/clips');

  url.searchParams.append('broadcaster_id', broadcasterId);
  if (options.started_at) url.searchParams.append('started_at', options.started_at);
  if (options.ended_at) url.searchParams.append('ended_at', options.ended_at);
  if (options.first) url.searchParams.append('first', options.first.toString());
  if (options.after) url.searchParams.append('after', options.after);

  const response = await fetch(url.toString(), {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch clips');
  }

  return await response.json();
}

export async function getGames(gameIds: string[], token: string) {
  if (gameIds.length === 0) return [];

  const clientId = import.meta.env.TWITCH_CLIENT_ID;
  const url = new URL('https://api.twitch.tv/helix/games');

  // Twitch allows up to 100 IDs per request
  gameIds.forEach(id => url.searchParams.append('id', id));

  const response = await fetch(url.toString(), {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch games');
  }

  const data = await response.json();
  return data.data;
}
