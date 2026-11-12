# WU-03 · Configuración por entorno y `MEDIA_ROOT` fuera del repo

**Fase:** 1 · Base · **Tamaño:** S · **Depende de:** WU-02

## Hallazgos que resuelve
A4 (ubicación de thumbs), A9.

## Contexto
Hoy los videos tienen que copiarse a `public/source` dentro del repo y las miniaturas se escriben al lado de cada video. Para Chromecast además hace falta saber con qué URL pública (IP/host LAN) se expone la API.

## Tareas
- [x] `src/config.js` que lee y valida (con `zod` o validación manual) variables de entorno, con `.env.example`:
  | Variable | Ejemplo | Uso |
  |---|---|---|
  | `MEDIA_ROOT` | `D:\Videos\Series` | Raíz de la biblioteca (solo lectura) |
  | `CACHE_DIR` | `D:\AI - FOLDER\s-hub\cache` | Thumbs, remux, base SQLite |
  | `HOST` | `0.0.0.0` | Interfaz de escucha |
  | `PORT` / `HTTPS_PORT` | `3000` / `8443` | Puertos |
  | `PUBLIC_BASE_URL` | `https://flix.tudominio.com:8443` | Base para URLs absolutas que consume el Chromecast |
  | `TLS_CERT` / `TLS_KEY` | rutas | HTTPS (WU-07) |
  | `CORS_ORIGINS` | `https://...receiver,...` | WU-07 |
  | `FFMPEG_PATH` / `FFPROBE_PATH` | opcional | Override de binarios |
  | `LOG_LEVEL` | `info` | WU-10 |
- [x] **Red parametrizable** (decisión 2026-10-21): agregar `PROTOCOL`, `PUBLIC_HOST` (autodetección de IPv4 privada si falta), `PUBLIC_PORT`, `CAST_RECEIVER_APP_ID`; `PUBLIC_BASE_URL` se deriva de esas si no se setea. Ver tabla completa en `../CLAUDE.md` (raíz del proyecto, fuera del repo) → "Todo parametrizable".
- [x] `GET /api/v1/config` → `{ publicBaseUrl, castReceiverAppId, version }` para que el front no tenga URLs compiladas.
- [x] `server.js` elige `http`/`https` según `PROTOCOL`.
- [x] Servir medios desde `MEDIA_ROOT` (no desde `public/`). Mantener alias `/source/*` temporal para el front viejo.
- [x] Miniaturas y derivados siempre en `CACHE_DIR`, **nunca** en `MEDIA_ROOT` (permite montar la biblioteca como solo lectura).
- [x] Soportar rutas Windows (`D:\...`) usando `node:path` en lugar de `split('/')`.
- [x] Script de migración opcional: mover `*.mp4.jpg` existentes de la biblioteca al cache.

## Criterios de aceptación
- [x] La API arranca apuntando a una carpeta arbitraria del disco sin copiar nada al repo.
- [x] Si falta una variable obligatoria, falla al arrancar con mensaje claro.

> **Estado:** ✅ hecho 2026-10-21.
> - `src/config.js`: todas las variables (`PROTOCOL`, `HOST`, `PORT`, `PUBLIC_HOST` con autodetección de IPv4 LAN, `PUBLIC_PORT`, `PUBLIC_BASE_URL`, `TLS_*`, `MEDIA_ROOT`, `CACHE_DIR`, `CAST_RECEIVER_APP_ID`, `CORS_ORIGINS`, `FFMPEG_PATH`, `FFPROBE_PATH`, `LOG_FORMAT`). Valida y reporta todos los errores juntos; advierte si la URL pública no sirve para Chromecast. Sin dependencias nuevas.
> - Rutas relativas del `.env` se resuelven contra `apps/api`. Defaults: `MEDIA_ROOT=public/source`, `CACHE_DIR=../../cache` (raíz del repo, gitignored).
> - `server.js` elige http/https según `PROTOCOL` y muestra un resumen al arrancar.
> - `GET /api/v1/config`, `/source/*` sirve desde `MEDIA_ROOT`, `/thumbs/*` desde el cache. Miniaturas ya no se escriben en la biblioteca.
> - Script `npm run media:migrate-thumbs -w @s-hub/api [-- --dry-run]`.
> - Probado contra la película real: listado, cover.webp, Range 206 sobre 1,3 GB, miniatura en ~0,3 s.
> - No se usó zod (validación manual, cero dependencias).
