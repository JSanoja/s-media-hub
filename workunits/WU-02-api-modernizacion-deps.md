# WU-02 · Modernizar API: Express 5, ESM, limpiar dependencias

**Fase:** 1 · Base · **Tamaño:** M · **Depende de:** WU-01

## Hallazgos que resuelve
A3, A5 (parcial), A8, A11.

## Tareas
### Dependencias
- [x] **Eliminar** (sin uso o muertas): `ffmpeg@0.0.4`, `ffprobe`, `thumbsupply`, `cookie-parser`, `debug`, `nodemon`.
- [x] **Reemplazar `fluent-ffmpeg`** (repositorio archivado y deprecado) por un wrapper propio mínimo sobre `node:child_process.spawn` + `ffmpeg-static` / `ffprobe-static` (o el ffmpeg del sistema vía `FFMPEG_PATH`). Ver WU-06.
- [x] Actualizar `express` 4.16 → **5.x** (manejo nativo de promesas rechazadas en handlers, `req.query` de solo lectura, sintaxis de rutas de path-to-regexp v8).
- [x] Actualizar `morgan` (1.12). `pino-http` queda para WU-10.
- [x] `npm audit` en 0 vulnerabilidades high/critical.

### Código
- [x] Migrar a **ESM** (`"type": "module"`, `import`/`export`).
- [x] Unificar `bin/www` + `app.js` en `src/server.js` (arranque) y `src/app.js` (factory `createApp(config)` testeable).
- [x] Borrar `routes/index.js` (usa `res.render` sin view engine).
- [x] Estructura:
  ```
  src/
    app.js  server.js  config.js
    routes/   (library, media, thumbs, health)
    services/ (scanner, ffmpeg, thumbs, db)
    lib/      (safePath, naturalSort, errors)
  ```
- [x] Middleware central de errores con respuestas JSON `{ error: { code, message } }`.
- [x] `npm run dev` → `node --watch --env-file=.env src/server.js`.
- [x] Graceful shutdown (SIGINT/SIGTERM cierra el server y procesos ffmpeg en curso).

### Docs
- [x] Reescribir el README de la API para que coincida con la respuesta real (se completa en WU-05 con el contrato v1).

## Criterios de aceptación
- [x] `package.json` sin dependencias sin uso; ninguna dependencia deprecada.
- [x] La API arranca en Node 22 y 24 con el mismo comportamiento de `/api/browse` que hoy (compatibilidad temporal para el front viejo hasta WU-15).

> **Estado:** ✅ hecho 2026-10-21.
> - Dependencias: `express@5.3`, `morgan@1.12`, `ffmpeg-static`, `ffprobe-static`. Eliminadas: `fluent-ffmpeg`, `ffmpeg`, `ffprobe`, `thumbsupply`, `cookie-parser`, `debug`, `nodemon`. `npm audit`: 0.
> - ESM + `src/` (server/app/config/routes/services/lib). `bin/www`, `app.js` y `routes/` eliminados.
> - `/api/browse` y `/api/thumb` mantienen el contrato legacy (incluido el `cover` con `undefined`, que se arregla en WU-05) y el front viejo sigue funcionando.
> - Bugs resueltos de paso: A2 (global implícita), A3 (`res.render`), A5 (thumb colgado), dedupe de miniaturas.
> - Nuevo: `GET /api/health`, errores JSON, graceful shutdown, `.env.example`, 8 tests con `node:test`.
> - Pendiente a propósito: path traversal (WU-04), `MEDIA_ROOT` (WU-03).
