# @s-hub/tv

Web UI for the TV: a 10-foot UI you navigate with the remote control. The API serves it at `/tv/`, and the Android TV app (`apps/android-tv`) loads it. See `workunits/WU-11-tv-ui.md`.

Vite 8 + Preact 11 + TypeScript.

- Routing uses the URL hash (`#/folder/:id`, `#/item/:id`, `#/play/:id`).
- Spatial navigation is custom (`src/lib/focus.ts`).
- Inside the app, the native bridge `window.SHubPlayer` (`src/lib/native.ts`) hands playback to the native player. In a regular browser, the UI falls back to an HTML5 `<video>` player.

```bash
npm run build    # from the repo root → apps/tv/dist
npm run dev:tv   # Vite dev server, proxied to the API
```
