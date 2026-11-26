# Self-hosting MyTube

## Architecture and requirements

Use Node.js 24 or newer. No npm dependencies, Docker, new proxy, or second authentication system are required. `node:sqlite` stores subscriptions, collections, preferences, metadata, watched/saved state and an increasing revision. `index.html`, `app.mjs` and the storage adapter are shared with GitHub Pages.

Static hosts serve `runtime.mjs` in public mode: IndexedDB stores state and localStorage stores the user-provided key, and the browser calls YouTube directly. The local server serves a server-mode runtime instead, keeping state in SQLite and the key in a separate protected file. A backend failure never falls back to public mode or a different database.

The server binds only to 127.0.0.1. **A trusted Tailscale Serve proxy must be the only remote path to it.** Every route, including frontend assets, backup and health, checks `Tailscale-User-Login` against the configured account. Loopback processes on the Mac are trusted: another process running locally can supply that header. Do not forward this port through a proxy that preserves untrusted identity headers. Do not enable Tailscale Funnel.

POST endpoints require the exact configured browser origin, JSON and a random CSRF token obtained from the authenticated state endpoint. There is no CORS access. The YouTube endpoint allows only channels, public playlist lookup, playlistItems and videos with the exact parameter sets the frontend needs, a fixed Google destination, a timeout and request limits. It is not an HTTP proxy.

## Install

Keep the checkout and private data in separate directories. Configuration example (replace placeholders):

```json
{
  "dataDir": "/absolute/private/mytube-data",
  "login": "YOUR_TAILSCALE_LOGIN",
  "origin": "https://YOUR_MACHINE.YOUR_TAILNET.ts.net:10444",
  "port": 8768
}
```

Protect the configuration and data directory with modes 0600 and 0700. Never place private data inside the checkout. Start explicitly:

```sh
node server.mjs /absolute/private/config.json
```

Alternatively set `MYTUBE_CONFIG`, or `MYTUBE_DATA_DIR`, `TAILSCALE_LOGIN`, `MYTUBE_ORIGIN` and optionally `PORT`. Install the private route using the existing Tailscale daemon:

```sh
tailscale serve --bg --https=10444 http://127.0.0.1:8768
```

This keeps the route configured while the application is stopped; a gateway error then means the app needs starting. TLS and device authorization remain Tailscale's responsibility. Authorized remote computers and phones need access to this tailnet and must resolve the machine's tailnet name.

## Service lifecycle and strict boot behavior

The Mac installation uses an on-demand LaunchAgent `dev.kakkoi.mytube`, with `RunAtLoad=false` and `KeepAlive=false`. Registering the job does not start it. It does not start at login/boot, nor automatically restart after an intentional stop. It runs in the logged-in user's launchd domain; logging that user out ends that domain. No reboot was performed during verification.

The prepared App Home integration uses the existing manager and visual style, calling launchctl for this job. It supports Start, Stop, Restart, status and an authenticated health link. It hard-disables enabling MyTube at boot even if a stale dashboard state file requests it. Stopping MyTube does not stop the dashboard or its other children. Once launched, the MyTube job survives closing the browser and stopping the isolated test dashboard.

Generic local commands, with the actual UID substituted:

```sh
launchctl kickstart gui/UID/dev.kakkoi.mytube
launchctl kill SIGTERM gui/UID/dev.kakkoi.mytube
launchctl print gui/UID/dev.kakkoi.mytube
```

App Home's existing production shutdown stops its managed DropBox/GLM Lab children. Do not restart that dashboard to activate the new entry without arranging the interruption. Source changes alone do not update its running binary. See the private installation report for activation status.

## API key and restrictions

Configure the key once in authenticated Settings, or write `youtube.key` in the private data directory with mode 0600. The server never returns it, including in settings or backups. Settings leaves the password field empty and requires confirmation to replace an existing key. No key is written to request logs. File permissions protect the key from other local users; it is not application-level encrypted storage. Use the Mac's disk encryption for at-rest disk protection.

Use separate public-browser and self-hosted keys when applying client restrictions. Restrict both to **YouTube Data API v3**. A browser key uses website/referrer restrictions; a backend key uses the Mac's public outbound IP address restriction, if that address is stable. Tailnet/127.0.0.1 addresses are not the source IP Google sees. Changing a shared key's restrictions can break the public app. Do not remove existing restrictions merely to make the backend work.

See Google's [API key restriction documentation](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys). Successful requests prove current usability, not that the key's entire restriction policy is safe. Google Cloud Console access is required to audit the actual configured restrictions.

## Browser migration

1. In the existing public app, Settings → Export backup. Keep the original IndexedDB and key until migration is verified.
2. Open the private app through its tailnet HTTPS URL. Settings → Import backup or collection.
3. Import merges missing subscriptions, collections, cached videos, watched and saved IDs; it preserves existing matching subscriptions/videos rather than replacing them. New backups also carry feed preferences, imported only when the destination has no preferences.
4. Configure the server key once separately. Keys are never included in JSON exports. An older backup cannot contain preferences that the older app never persisted.
5. Check subscriptions, saved/history and refresh from a second device. Migrating does not delete browser data.

The installation migrated the existing browser state without modifying it. Private migration backups and test snapshots must stay outside Git.

## Synchronization and conflicts

Active idle tabs poll every three seconds and on focus. Sync waits while a form is focused, a refresh is running or playback is open, so it does not destroy an edit or playback session. Navigating away/defocusing the form allows sync. Reloading reads the server immediately.

Writes are atomic, granular mutations: collections and watched/saved memberships, individual subscriptions/videos, and individual preferences. Unrelated stale-client mutations merge. Entity/preference updates compare the previous value against current server state; conflicting edits return HTTP 409 with a visible message instead of overwriting the newer item. Idempotent replay of an already-applied change succeeds. Set memberships use the last explicit membership action. Conflicts retain unsaved state in the tab and block background replacement; export a recovery backup before reloading, then reapply the intended edit. Network failures also retain pending state. Do not close a tab with uncommitted edits before exporting them. There is no offline mutation queue across a closed browser.

SQLite uses WAL and FULL synchronous commits. Do not run two different versions of the server against the same data directory. On-disk state includes a revision but concurrency uses per-item previous values rather than replacing the entire state by revision.

## Backup and restore

Settings → Export backup produces a key-free JSON snapshot, including pending local edits for recovery. Authenticated GET `/api/backup` produces only the committed server snapshot. The private server does not serve arbitrary files, the database, config, source tree, or key file.

A consistent live database snapshot can also be exported locally:

```sh
node tools/backup.mjs /absolute/private/mytube-data /absolute/private/NEW-backup.json
```

The destination must not exist. The helper reads one SQLite snapshot and creates a 0600 JSON file. Do not copy just the SQLite main file while the service is running: recent changes may still be in WAL. A JSON snapshot avoids that problem and excludes credentials.

For non-destructive recovery use Settings import to merge a backup. For an exact committed-state restore, stop MyTube and restore to a **new, nonexistent directory**:

```sh
node tools/restore.mjs /absolute/private/backup.json /absolute/private/NEW-restored-data
```

The helper validates the backup and refuses any existing destination. Preserve the old directory, provision the key separately, update the private config's dataDir, then explicitly start. Check the result before retiring old data. Ordinary backups deliberately cannot restore the key: keep any secret recovery copy separately in a password manager or reissue it in Google Cloud Console.

## Updating and troubleshooting

1. Export a fresh backup outside the repository.
2. Stop only MyTube.
3. Check the checkout is clean, fetch and fast-forward the intended reviewed branch (`git pull --ff-only`). Do not reset a dirty checkout.
4. Run `npm test` and start MyTube explicitly again. No npm install or build step is necessary.
5. Verify authenticated `/health`, state and a refresh. Source updates do not touch the data directory.

If startup fails, check Node 24+, the private configuration path, permissions, port availability and the service log. If access returns 403, use the authorized Tailscale identity and the configured HTTPS origin. A stale CSRF token after a restart is resolved by reloading; export pending edits first. A gateway error indicates a stopped service or a Tailscale proxy problem. Quota exhaustion and invalid/restricted keys produce messages in the app. Keep error screenshots free of pasted credentials.

The embed explicitly sends an origin referrer because YouTube rejects players without client identification (error 153); see [YouTube's player error documentation](https://developers.google.com/youtube/iframe_api_reference#onError). Embedded playback and endscreen content remain controlled by YouTube. Shorts labels are duration candidates up to 180 seconds, not definitive Shorts classification. Feed refresh still has the original 500-entry-per-source limit, and is manual.

## Validation

`npm test` exercises granular concurrency/conflict rejection, the API allowlist, HTTP auth, CSRF, key isolation, private-file denial, persistence through server restart, and key-free backup. Real browser checks and machine-specific results are recorded separately; automated upstream responses are fixtures, not claims of real YouTube playback or network behavior.
