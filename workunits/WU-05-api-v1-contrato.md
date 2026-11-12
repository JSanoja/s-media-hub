# WU-05 · API v1: contrato nuevo de biblioteca y streaming

**Fase:** 2 · API · **Tamaño:** M · **Depende de:** WU-04

## Hallazgos que resuelve
A6, A7, A10, A11.

## Contexto
La respuesta actual (`{path, folders: string[], videos: string[], cover}`) obliga al front a armar URLs a mano y no tiene nada de lo que necesita un `MediaInfo` de Cast (URL absoluta, `contentType`, duración, imágenes, título, subtítulos).

## Contrato propuesto
```
GET  /api/v1/health
GET  /api/v1/library?path=<id>        → nodo de carpeta (series / temporada)
GET  /api/v1/items/:id                → detalle de un video
GET  /api/v1/items/:id/next           → siguiente episodio (para autoplay)
GET  /media/:id                       → stream del archivo (Range + CORS)
GET  /media/:id/thumb.jpg             → miniatura (genera on-demand)
GET  /media/:id/subtitles/:lang.vtt   → subtítulos en WebVTT (WU-08)
GET  /media/folders/:id/cover.jpg     → cover de carpeta
```
Ejemplo de item (todas las URLs absolutas con `PUBLIC_BASE_URL`):
```json
{
  "id": "c2lsaWNvbnZhbGxleS9zZWFzb24xL2NhcDEubXA0",
  "type": "episode",
  "title": "Capítulo 1",
  "series": "Silicon Valley", "season": 1, "episode": 1,
  "durationSec": 1712,
  "contentType": "video/mp4",
  "castCompatible": true,
  "streamUrl": "https://flix.tudominio.com:8443/media/c2ls...",
  "thumbUrl": "https://.../media/c2ls.../thumb.jpg",
  "subtitles": [{ "lang": "es", "url": "https://.../subtitles/es.vtt" }],
  "progress": { "positionSec": 0, "watched": false }
}
```

## Tareas
- [x] IDs: base64url de la ruta relativa (simple y estable) o hash → tabla en SQLite (WU-06).
- [x] Listado con `fs.promises.readdir` (async), filtro por extensión case-insensitive, **orden natural** (`Intl.Collator(undefined, {numeric:true})`).
- [x] Parseo de nombres: `S01E02`, `1x02`, `cap2`, `Temporada 1` → `season/episode/title` legibles.
- [x] Cover de carpeta: `cover.(jpg|png|webp)` / `poster.*` / `folder.*`; si no hay, `null` (no `/undefined`).
- [x] `/media/:id` con soporte de **Range** (`206 Partial Content`), `Content-Type` correcto, `Accept-Ranges`, ETag/Last-Modified. Se puede usar `send`/`express.static` con root `MEDIA_ROOT` detrás de la validación de ID.
- [x] Mantener `/api/browse` legacy como adaptador hasta WU-15.
- [x] Tipos del contrato en `packages/shared` (TS) + JSON Schema/OpenAPI (WU-10).

## Criterios de aceptación
- [x] `curl -H "Range: bytes=0-1023" /media/:id` → 206 con 1024 bytes.
- [x] Episodios ordenados 1, 2, …, 10 (no 1, 10, 2).
- [x] Ningún campo `undefined` en las respuestas.

> **Estado:** ✅ hecho 2026-10-21.
> - Endpoints: `/api/v1/config`, `/api/v1/library[?path=id]`, `/api/v1/items/:id`, `/api/v1/items/:id/next`, `/media/:id` (Range), `/media/:id/thumb.jpg` (on-demand), `/media/:id/subtitles.vtt` (SRT→VTT al vuelo, UTF-8/Windows-1252), `/media/folders/:id/cover`.
> - Cambio vs. diseño: los subtítulos se exponen por id del archivo de subtítulo (`/media/<subId>/subtitles.vtt`), no por idioma; y el thumb on-demand se adelantó de WU-06.
> - Clasificación automática: `library`, `folder`, `movie` (1 video sin subcarpetas), `series` (subcarpetas de temporada o mayoría SxxEyy/cap N), `season`. Títulos/año desde nombres de release (YIFY, etc.), prefiere el año entre paréntesis.
> - CORS propio en `/api/v1` y `/media` (adelanta parte de WU-07).
> - IDs: base64url canónico de la ruta relativa, raíz = `root`.
> - Contrato JSDoc en `packages/shared`. 17 tests nuevos (61 total). Verificado contra la película real (Range a 500 MB, póster, thumb 0,27 s, VTT).
> - Pendiente: el `.srt` de la película sale como `und` (no tiene sufijo de idioma); renombrarlo a `.en.srt` o detectar idioma por contenido (WU-08).
