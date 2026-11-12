# @s-hub/api

Node/Express API that serves the local video library. Part of the `s-hub` monorepo.

It serves API v1 for the TV UI and the Android TV app: the library, media streaming, profiles, watch history, devices and subtitles. It also serves the built TV UI at `/tv/`.

## Requirements

- Node `>= 22.13` (24 LTS recommended). `node:sqlite` must be available.
- ffmpeg/ffprobe are bundled through `ffmpeg-static` / `ffprobe-static`. Set `FFMPEG_PATH` / `FFPROBE_PATH` to use other builds.

## Usage (from the monorepo root)

```bash
npm install
npm run dev     # node --watch, reloads on save
npm start
npm test        # node:test
```

Configuration: copy `.env.example` to `.env`. Every variable is documented there and in the [root README](../../README.md#-environment-variables).

## API v1 (TV UI / Android TV app)

Every URL the API returns is **absolute** and built from `PUBLIC_BASE_URL`. Ids are opaque: the base64url of the path relative to `MEDIA_ROOT`, and the root is `root`. CORS is enabled on `/api/v1/*` and `/media/*`. The contract is in JSDoc: `packages/shared/src/index.js`.

Endpoints marked 🔑 require a profile session (header `X-Profile-Token`). On the others the header is optional: when present, items include that profile's `progress`.

| Endpoint                                       | Returns                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/health`                              | `{ status: "ok" }`                                                                                    |
| `GET /api/v1/config`                           | `{ publicBaseUrl, castReceiverAppId, version }`                                                       |
| `GET /api/v1/library[?path=<folderId>]`        | Folder: `{ id, type, title, year, parentId, posterUrl, folders[], items[] }`                          |
| `GET /api/v1/items/:id`                        | Video with `streamUrl`, `thumbUrl`, `posterUrl`, `subtitles[]`, `size`, `progress`                    |
| `GET /api/v1/items/:id/next`                   | `{ next: Item \| null }` (natural order, crosses seasons)                                             |
| `GET /api/v1/continue-watching` 🔑             | Items in progress for the profile, most recent first                                                  |
| `PUT /api/v1/items/:id/progress` 🔑            | `{ positionSec, durationSec?, deviceId?, ended? }` → `progress` (≥ 90 % marks it watched)             |
| `POST` / `DELETE /api/v1/items/:id/watched` 🔑 | Mark or unmark the video as watched                                                                   |
| `GET /api/v1/profiles`                         | Profiles `[{ id, name, color }]`                                                                      |
| `POST /api/v1/profiles/:id/session`            | `{ pin, deviceId }` → `{ token, profile }` · 401 `INVALID_PIN` (+`attemptsLeft`) · 429 `PIN_LOCKED`   |
| `GET /api/v1/profiles/me`                      | Profile of the `X-Profile-Token` header (401 `PROFILE_REQUIRED`)                                      |
| `DELETE /api/v1/profiles/session`              | Log out (header `X-Profile-Token`)                                                                    |
| `PUT /api/v1/profiles/:id/pin`                 | `{ currentPin, newPin, deviceId }` → 204, closes all of the profile's sessions                        |
| `POST /api/v1/devices/heartbeat`               | `{ deviceId, kind, name?, model?, appVersion?, nowPlaying? }` → Device (profile taken from the token) |
| `GET /api/v1/devices[?active=1]`               | Devices (active = heartbeat less than `DEVICE_ACTIVE_SECONDS` ago, default 120 s) and what they play  |
| `DELETE /api/v1/devices/:id`                   | Forget a device (204 · 404)                                                                           |
| `GET /media/:id`                               | Video with HTTP Range (206)                                                                           |
| `GET /media/:id/thumb.jpg`                     | Thumbnail (generated on first request, then cached)                                                   |
| `GET /media/:id/subtitles.vtt`                 | Subtitle as WebVTT (`.srt` converted; UTF-8 or Windows-1252)                                          |
| `GET /media/folders/:id/cover`                 | Folder poster (`cover` > `poster` > `folder`; `.webp` > `.jpg` > `.png`)                              |

Folder types (detected automatically):

- `library`: the root.
- `movie`: a single video and no subfolders.
- `series`: subfolders named "Season N", "Temporada N" or "S1", or mostly videos named with SxxEyy or "cap N".
- `season`: a season folder inside a series.
- `folder`: anything else.

Subtitle language: when the file name says it (`movie.es.srt`), that wins. Otherwise the API detects it from the content and sets `langSource: "content"`. If neither works, the language is `und`. The result is cached in SQLite.

Library layout:

```
Movie (2010) [1080p]/         → movie
  cover.webp
  Movie.2010.1080p.mp4
  Movie.2010.1080p.srt        (or .es.srt / .en.srt)
Series/                       → series
  cover.webp
  Season 1/                   → season
    Series.S01E01.mp4
    Series.S01E01.es.srt
```

### Errors

Errors are always JSON: `{ "error": { "code": "NOT_FOUND", "message": "..." } }`. Common codes: 400 `INVALID_PATH`, 404 `NOT_FOUND`, 415 `UNSUPPORTED_TYPE`.

## Static routes

- `/` → redirects to `/tv/`.
- `/tv/` → the TV UI (`apps/tv/dist`, see `TV_DIR`).

The old Angular front end and its endpoints (`/api/browse`, `/api/thumb`, `/source/*`, `/thumbs/*`) were removed in WU-15. Media is only reachable through `/media/:id`.

## Structure

```
src/
  server.js              HTTP/HTTPS startup + graceful shutdown
  app.js                 createApp(config) (testable)
  config.js              environment variables (validated)
  routes/v1.js           /api/v1 (config, library, items, next, history)
  routes/media.js        /media (stream, thumbnail, subtitles, covers)
  routes/profiles.js     /api/v1/profiles
  routes/devices.js      /api/v1/devices
  services/library.js    walks and classifies the library
  services/db.js         embedded SQLite (node:sqlite) + migrations → CACHE_DIR/shub.db
  services/profiles.js   PIN profiles (scrypt), token sessions, attempt lockout
  services/history.js    per-profile watch state ("Continue watching", watched)
  services/devices.js    devices and heartbeat
  services/subtitles.js  detected subtitle language (cached)
  services/ffmpeg.js     spawn wrapper for ffmpeg/ffprobe
  services/thumbs.js     thumbnails in CACHE_DIR (deduplicated)
  lib/                   ids, naming, subtitles, langDetect, safePath, cors, rateLimit, errors, auth
scripts/migrate-thumbs.js
scripts/deploy-server.sh deploys the API to a Linux server over SSH (see the root README)
test/                    node:test
```

## Known gaps

- Duration and cast compatibility (`durationSec`, `castCompatible`) and a SQLite index → **WU-06**.
- Remux/transcode of unsupported formats → **WU-08**.
