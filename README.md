# Twitch Clip Explorer

A web application for browsing and downloading clips from Twitch streamers. Searches the Twitch API by channel name, displays results in a grid with filtering and sorting, and downloads clips via Twitch's GQL API.

## Prerequisites

- Node.js 22.12.0 or later
- A Twitch Developer client ID and secret (from [Twitch Developer Console](https://dev.twitch.tv/console))

## Setup

1. Clone the repository

```
cd twitch-clipper
```

2. Install dependencies

```
pnpm install
```

3. Create a `.env` file with your Twitch credentials

```
TWITCH_CLIENT_ID=your-client-id
TWITCH_CLIENT_SECRET=your-client-secret
PUBLIC_MAX_CLIPS=50000
```

4. Start the development server

```
pnpm dev
```

5. Open http://localhost:4321 in your browser

## Build and deploy

### Local development

```
pnpm dev
```

### Deploy to Cloudflare Pages

```
pnpm build
pnpm preview
```

Or deploy directly with Wrangler:

```
pnpm build
npx wrangler deploy
```

## Project structure

```
src/
  lib/
    twitch.ts          Twitch API client (OAuth, clips, games endpoints)
  pages/
    api/
      clips.ts         Proxy endpoint for fetching clips from Twitch API
      clips/
        download.ts    Server-side download handler via GQL streaming proxy
        formats.ts     Clip quality/format listing via GQL
    index.astro        Main page with search UI and clip grid
  scripts/
    index.ts           Application entry point, initializes all modules
    api.ts             HTTP client for API proxy calls
    cache.ts           IndexedDB cache for storing full clip libraries per channel
    categories.ts      Game category detection and filtering
    clips.ts           Clip rendering, lazy loading, and filter logic
    dom.ts             DOM element references
    filters.ts         Sort and filter UI state
    modal.ts           Clip preview modal and download progress
    notify.ts          Terminal-style confirmation dialogs and toast notifications
    recent.ts          Recent search history stored in localStorage
    search.ts          Search orchestration, time window pagination, cache handling
  styles/
    index.css          All styles
```

## Features

- Search any Twitch channel and retrieve all available clips
- Cache full clip libraries in IndexedDB for faster subsequent searches
- Filter clips by game category and sort by views, date, or oldest
- Lazy-loaded clip grid with infinite scroll
- Clip preview modal with Twitch embed player
- Download clips in multiple qualities via Twitch GQL API
- Recent searches stored in localStorage
- Fixed progress bar for long-running full-library loads
