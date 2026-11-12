# android-tv: S-HUB app for Chromecast with Google TV

Android TV app (Kotlin). It loads the `apps/tv` web UI, served by the API at `/tv/`, in a WebView. Playback uses native **Media3/ExoPlayer**: MKV, MP4, HEVC, AC3/EAC3 passthrough and WebVTT subtitles. The app shows up in the TV's apps row (Leanback launcher). See `workunits/WU-12-android-tv-app.md`.

## Requirements (one time, on WSL/Linux)

```bash
bash apps/android-tv/scripts/setup-wsl.sh   # JDK 17 + Android SDK + Gradle 8.11.1 + gradlew
source ~/.bashrc
```

## Build and install

1. On the TV, go to Developer options and turn on **Wireless debugging**. Note the IP:port it shows.
2. Start the API with the built UI: `npm run build && npm run dev` from the repo root.
3. Run:
   ```bash
   bash apps/android-tv/scripts/deploy.sh <tv-ip>:<port>
   ```

The default server URL comes from `gradle.properties` (`shub.serverUrl`), or you can pass `SERVER_URL=... deploy.sh`. You can also change it inside the app: when the app can't connect it offers **Change server**, and the MENU key opens the same dialog if your remote has one.

## Remote control

- **UI:** arrows to move, OK to select, Back to go back.
- **Player:**
  - OK: play/pause.
  - ← / →: −10 s / +10 s.
  - ↑: show controls (subtitles, tracks).
  - ↓: subtitle sync panel. In the panel, ← / → move the subtitles by 0.5 s and ↑ / ↓ by 0.1 s. The offset is saved for that video.
  - Back: exit.
- When a video ends, the next episode starts.

## What the app reports to the API

- Playback progress every 15 s and on pause, for the profile in use.
- A device heartbeat with what is playing. While the app is in the background it sends nothing, so the device turns inactive after `DEVICE_ACTIVE_SECONDS`.

## Versions

AGP 8.7.3 · Kotlin 2.0.21 · Gradle 8.11.1 · compile/target SDK 35 · minSdk 26 · Media3 1.5.1 · JDK 17.
