# @s-hub/api

API Node/Express que sirve la biblioteca de videos local. Parte del monorepo `s-hub`.

Estado: **WU-05** — API v1 para el front nuevo/Chromecast + endpoints legacy del front viejo.

## Requisitos

- Node `>= 22.13` (recomendado 24 LTS)
- ffmpeg/ffprobe: vienen incluidos vía `ffmpeg-static` / `ffprobe-static` (se pueden reemplazar con `FFMPEG_PATH` / `FFPROBE_PATH`).

## Uso (desde la raíz del monorepo)

```bash
npm install
npm run dev     # node --watch, recarga al guardar
npm start
npm test        # node:test
```

Configuración: copiar `.env.example` a `.env` (opcional).

| Variable                       | Default            | Uso                                                  |
| ------------------------------ | ------------------ | ---------------------------------------------------- |
| `HOST`                         | `0.0.0.0`          | Interfaz de escucha (todas → accesible desde la LAN) |
| `PORT`                         | `3000`             | Puerto                                               |
| `FFMPEG_PATH` / `FFPROBE_PATH` | binarios incluidos | Override de ffmpeg/ffprobe                           |
| `LOG_FORMAT`                   | `dev`              | Formato de morgan (`dev`, `combined`, `off`)         |

El resto de la configuración de red (`PROTOCOL`, `PUBLIC_HOST`, `MEDIA_ROOT`, …) se agrega en WU-03.

## API v1 (front nuevo / Chromecast)

Todas las URLs que devuelve son **absolutas** (`PUBLIC_BASE_URL`). Los ids son opacos (base64url de la ruta relativa; la raíz es `root`). CORS habilitado en `/api/v1/*` y `/media/*`. Contrato en JSDoc: `packages/shared/src/index.js`.

| Endpoint                                        | Devuelve                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/health`                               | `{ status: "ok" }`                                                                                    |
| `GET /api/v1/config`                            | `{ publicBaseUrl, castReceiverAppId, version }`                                                       |
| `GET /api/v1/library[?path=<folderId>]`         | Carpeta: `{ id, type, title, year, parentId, posterUrl, folders[], items[] }`                         |
| `GET /api/v1/items/:id`                         | Video con `streamUrl`, `thumbUrl`, `posterUrl`, `subtitles[]`, `size`                                 |
| `GET /api/v1/items/:id/next`                    | `{ next: Item \| null }` (orden natural, cruza temporadas)                                            |
| `GET /api/v1/profiles`                          | Perfiles `[{ id, name, color }]` (WU-21)                                                              |
| `POST /api/v1/profiles/:id/session`             | `{ pin, deviceId }` → `{ token, profile }` · 401 `INVALID_PIN` (+`attemptsLeft`) · 429 `PIN_LOCKED`   |
| `GET /api/v1/profiles/me`                       | Perfil del header `X-Profile-Token` (401 `PROFILE_REQUIRED`)                                          |
| `DELETE /api/v1/profiles/session`               | Cerrar sesión (header `X-Profile-Token`)                                                              |
| `PUT /api/v1/profiles/:id/pin`                  | `{ currentPin, newPin, deviceId }` → 204, cierra las sesiones del perfil                              |
| `PUT /api/v1/items/:id/subtitles/:subId/offset` | `{ offsetMs }` (±600000) → guarda el ajuste de sincronización del subtítulo para ese video (WU-18)    |
| `POST /api/v1/devices/heartbeat`                | `{ deviceId, kind, name?, model?, appVersion?, nowPlaying? }` → Device (WU-19; perfil por token)      |
| `GET /api/v1/devices[?active=1]`                | Dispositivos (activos = heartbeat hace < `DEVICE_ACTIVE_SECONDS`, 120 s) con lo que reproducen        |
| `DELETE /api/v1/devices/:id`                    | Olvidar un dispositivo (204 · 404)                                                                    |
| `GET /media/:id`                                | Video con HTTP Range (206)                                                                            |
| `GET /media/:id/thumb.jpg`                      | Miniatura (se genera la primera vez)                                                                  |
| `GET /media/:id/subtitles.vtt[?offsetMs=]`      | Subtítulo en WebVTT (los `.srt` se convierten; UTF-8 o Windows-1252); `offsetMs` desplaza los tiempos |
| `GET /media/folders/:id/cover`                  | Póster de la carpeta (`cover` > `poster` > `folder`; `.webp` > `.jpg` > `.png`)                       |

Tipos de carpeta (automático): `library` (raíz), `movie` (1 video, sin subcarpetas), `series` (subcarpetas "Temporada N"/"Season N"/"S1" o mayoría de videos con SxxEyy/cap N), `season`, `folder`.

Convención de biblioteca:

```
Película (2010) [1080p]/      → movie
  cover.webp
  Pelicula.2010.1080p.mp4
  Pelicula.2010.1080p.srt     (o .es.srt / .en.srt)
Serie/                        → series
  cover.webp
  Temporada 1/                → season
    Serie.S01E01.mp4
    Serie.S01E01.es.srt
```

## Endpoints legacy (front Angular viejo, hasta WU-15)

### `GET /api/browse?path=/serie/temporada` (legacy)

Lista una carpeta de `public/source`. Si hay más de un video, genera en segundo plano las miniaturas faltantes (`<video>.mp4.jpg`).

```json
{
  "path": "/siliconvalley/season1",
  "folders": [],
  "videos": ["cap1.mp4", "cap2.mp4"],
  "cover": "/source/siliconvalley/season1/cover.jpg"
}
```

### `GET /api/thumb?path=/serie/temporada/cap1.mp4` (legacy)

Genera la miniatura del video. Responde `sucess` (texto, sic) o un error JSON.

### Estáticos

- `/` → build del front Angular viejo (`public/`, se elimina en WU-15).
- `/source/...` → videos e imágenes, con soporte de HTTP Range.

### Errores

Siempre JSON: `{ "error": { "code": "NOT_FOUND", "message": "..." } }`.

## Estructura

```
src/
  server.js              arranque HTTP/HTTPS + graceful shutdown
  app.js                 createApp(config) (testeable)
  config.js              variables de entorno (validadas)
  routes/v1.js           /api/v1 (config, library, items, next)
  routes/media.js        /media (stream, thumb, subtítulos, covers)
  routes/legacy.js       /api/browse, /api/thumb (front viejo)
  services/library.js    recorrido y clasificación de la biblioteca
  services/ffmpeg.js     wrapper spawn de ffmpeg/ffprobe
  services/thumbs.js     miniaturas en CACHE_DIR (con deduplicación)
  services/db.js         SQLite embebido (node:sqlite) + migraciones → CACHE_DIR/shub.db
  services/profiles.js   perfiles con PIN (scrypt), sesiones por token, bloqueo por intentos
  routes/profiles.js     /api/v1/profiles
  services/devices.js    dispositivos y heartbeat (WU-19)
  services/subtitles.js  idioma detectado (cache) y ajuste de sincronización (WU-18)
  lib/langDetect.js      idioma por contenido (palabras frecuentes, sin dependencias)
  routes/devices.js      /api/v1/devices
  lib/                   ids, naming, subtitles, safePath, cors, rateLimit, errors
scripts/migrate-thumbs.js
test/                    node:test
```

## Pendiente conocido

- Duración y compatibilidad Cast (`durationSec`, `castCompatible`) e índice en SQLite → **WU-06**.
- Remux/transcode de formatos no compatibles → **WU-08**.
