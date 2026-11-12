# WU-04 · Seguridad: path traversal, global implícita, validación

**Fase:** 1 · Base · **Tamaño:** S · **Depende de:** WU-03

## Hallazgos que resuelve
A1, A2 (críticos).

## Problemas concretos
```js
// routes/browse.js — hoy
path = req.query.path ? req.query.path : "";   // ← global implícita (sin let)
readdirSync(sourceFolder + source, ...)         // ← ?path=/../../.. sale de la carpeta
```
```js
// routes/thumb.js — hoy
ffmpeg(sourceFolder + path)                      // ← ffmpeg sobre cualquier archivo del disco
```

## Tareas
- [x] `lib/safePath.js`: resolver `path.resolve(MEDIA_ROOT, rel)` y verificar que el resultado quede dentro de `MEDIA_ROOT` (comparando con `path.relative` y rechazando `..`/absolutas). Resolver también symlinks con `fs.realpath`.
- [x] Usar IDs opacos en la API v1 (WU-05) en lugar de rutas crudas; el ID se mapea a una ruta validada.
- [x] Eliminar toda variable global implícita; activar ESLint `no-implicit-globals` / `no-undef` (ESM ya es strict mode, eso solo ya rompe el bug).
- [x] Whitelist de extensiones servibles (`.mp4 .m4v .mkv .webm .vtt .srt .jpg .png`).
- [x] Nunca pasar input del usuario a ffmpeg sin pasar por `safePath`; usar `spawn` con array de argumentos (sin shell).
- [x] `helmet` con configuración compatible con Cast (sin bloquear el embedding del receiver ni el CORS de medios).
- [x] Rate limit liviano en endpoints que disparan ffmpeg.
- [ ] (Diferido a WU-09, cuando existan endpoints de escritura) Token simple (`API_TOKEN`) en header/query para endpoints de escritura (progreso, re-escaneo), útil si alguna vez se expone fuera de la LAN.

## Criterios de aceptación
- [x] Test automatizado: `?path=/../../Windows`, rutas absolutas, `%2e%2e`, y `\..\` en Windows devuelven 400/404.
- [x] Test de concurrencia: dos browse simultáneos con paths distintos devuelven cada uno lo suyo.

> **Estado:** ✅ hecho 2026-10-21.
> - `src/lib/safePath.js`: `toSafeSegments` (rechaza `..`, `C:\`, `\\server`, `\0`, ocultos, caracteres inválidos; acepta `/` y `\`) y `resolveInside` (exige existencia, tipo, extensión permitida y que el `realpath` —symlinks incluidos— quede dentro de `MEDIA_ROOT`).
> - Aplicado en `/api/browse`, `/api/thumb` (antes de lanzar ffmpeg) y `/source/*` (middleware previo a `express.static`, `dotfiles: deny`). Whitelist: videos `.mp4 .m4v .mkv .webm .mov`, subtítulos `.vtt .srt`, imágenes `.jpg .jpeg .png .webp`.
> - `helmet@8` con CSP desactivada hasta WU-11 y `Cross-Origin-Resource-Policy: cross-origin` (Chromecast).
> - Rate limit propio (30/min por IP) en `/api/thumb`.
> - ffmpeg recibe siempre rutas absolutas resueltas (nunca empiezan con `-`), vía `spawn` sin shell.
> - 23 tests nuevos (`test/security.test.js`), incluidas rutas crudas sin normalizar y symlinks. Verificado contra la película real.
> - Token de API diferido a WU-09 (todavía no hay endpoints de escritura).
