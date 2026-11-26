# MyTube

Your subscriptions. Your feed. Your attention.

A browser-only curated YouTube reader. No recommendation ranking, account or server-side database. Independent of Top YouTube Shorts.

## Run

Serve this directory over HTTP (e.g. `python3 -m http.server 8000`) or enable GitHub Pages from main / root in repository settings.

In Settings, enter your own YouTube Data API v3 key. Enable the API in Google Cloud and restrict the key to that API and your deployment's HTTP referrer. The key stays in browser localStorage and is sent to Google; it is not included in exports.

In Subscriptions, add a channel by @handle or /channel/UC… URL, or opt into the Japanese AI starter collection. Refresh to retrieve uploads. Starter handles are provisional and resolved through the API when imported; review the returned channel names.

## Features

- Chronological feed restricted to active subscriptions.
- Collections, pause/unsubscribe, per-channel format and initial history.
- Unwatched filter, manual watched state, watch later.
- Finite embedded player with next/previous controls and keyboard arrows; touch gestures outside the iframe.
- IndexedDB state, JSON backup and collection import/export.
- Hash routing compatible with static hosts.

## Limitations / next steps

- Requires a user-provided API key. Channel upload playlist queries are used instead of expensive global search.
- Shorts classification is a duration heuristic (up to 180 seconds), not a verified YouTube Shorts flag. Short landscape videos may be included.
- Upload retrieval is limited to 10 pages per channel per refresh; cached data is not a comprehensive archive and removed videos may remain cached.
- YouTube embedding can be disabled by creators. External YouTube links are available.
- Embedded YouTube controls and related content remain controlled by YouTube; the app itself does not insert recommendations.
- Watch state is manual (Watched & next or Mark watched), not playback tracking.
- No automatic refresh, installable PWA/service worker, shareable collection URL, collection deletion/rename or cross-device sync yet.
- The current UI is an initial implementation; live API, mobile playback, browser E2E and deployment verification are still required.

Not affiliated with YouTube or Google.
