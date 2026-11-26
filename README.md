# MyTube

Your subscriptions. Your feed. Your attention.

A curated chronological YouTube reader, independent of Top YouTube Shorts. One frontend supports both a browser-only GitHub Pages app and a private self-hosted instance.

## Public mode

Serve this directory over HTTP (for example `python3 -m http.server 8000`), or use GitHub Pages from main / root. No backend, Node runtime or npm install is required for static hosting. Configure your YouTube Data API v3 key in Settings; it stays in browser localStorage. State is stored in IndexedDB. JSON exports exclude the key.

Restrict the public key to the YouTube Data API and your hosting referrer. See [self-hosting documentation](docs/SELF-HOSTING.md) for the different restrictions required by server requests.

## Self-hosted mode

Node.js 24+ provides the HTTP server and SQLite without third-party packages. The private instance shares subscriptions, collections, metadata, history, saved videos and preferences across devices. API requests and the key stay on the server. Access uses the existing Tailscale identity and CSRF protection, with granular mutations to prevent stale clients replacing newer state.

Follow [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) for installation, on-demand lifecycle, migration, secret configuration, backup/restore, updates and troubleshooting. Keep all private data outside this repository. MyTube must not start automatically at boot.

## Features

- Only explicitly subscribed channels and public playlists, newest first; no popularity ranking or MyTube recommendations.
- Bulk handles/URLs, collections, per-source format/history preferences, pause and unsubscribe.
- Shorts candidates (duration ≤180 seconds; a heuristic), long-form and unwatched filters.
- Watch Later, manual watched state, duplicate prevention, JSON backup/collection import and export.
- Non-embeddable videos hidden by default, with a YouTube-only opt-in filter.
- Finite embedded playback queue with previous/next, keyboard and touch navigation; external YouTube links.
- Japanese AI starter handles are provisional: resolve them through the API and review the returned channel names.

## Development and tests

```sh
npm test
```

No dependencies to install. HTTP tests open temporary loopback listeners and use mocked upstream responses; real API and browser checks are separate.

## Limits

Refresh is manual, with at most 10 pages / 500 entries per source per refresh. Cached metadata is not a complete archive. Some videos cannot embed, and YouTube controls its player and endscreen content. Watch state is manual. Active self-hosted tabs synchronize when idle; conflicts retain pending state for export/recovery. No automatic playback tracking, offline write queue, collection rename/delete, PWA or recommendation engine.

Not affiliated with YouTube or Google.
