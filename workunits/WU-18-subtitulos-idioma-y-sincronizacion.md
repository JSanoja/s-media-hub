# WU-18 · Subtítulos: idioma real y ajuste de sincronización

**Fase:** 2 · API + App · **Tamaño:** M · **Depende de:** WU-05, WU-12 · **Pedidos de Juan 2026-10-22:** App #4 y App #5.

## Parte A — Detectar el idioma (App #4)

Hoy el idioma sale solo del nombre (`peli.es.srt`); si no lo dice queda `und` ("Subtítulos").

- Detección por **contenido**: tomar ~200 líneas de diálogo (sin timestamps ni etiquetas) y clasificar con una librería liviana de detección de idioma (p. ej. `franc-min` o `tinyld`), con umbral de confianza; si no alcanza → `und`.
- El nombre del archivo, si trae idioma, **gana** sobre la detección; si contradice al contenido, se loguea.
- Cachear el resultado en SQLite por (ruta, mtime, tamaño) para no reanalizar.
- Etiqueta: "English", "Español", "English (detectado)".
- Caso real: el `.srt` de Resident Evil (inglés) debe salir como **English**.

## Parte B — Adelantar/atrasar subtítulos (App #5)

- **API:** `GET /media/:subId/subtitles.vtt?offsetMs=-1500` desplaza todos los tiempos (y descarta cues que quedan antes de 0).
- **Reproductor nativo:** panel "Sincronizar subtítulos" (desde los controles o con ↓ mientras se reproduce): **−0,5 s / +0,5 s** (y ±0,1 s fino), muestra el offset actual; al cambiar, recarga el subtítulo con el nuevo offset manteniendo la posición del video.
- El offset se **guarda por video** (SQLite, `subtitle_offset(item_id, sub_id, offset_ms)`) para no repetir el ajuste.
- Reproductor web: mismo `offsetMs` en la URL del `<track>`.

## Criterios de aceptación

- [x] El subtítulo de Resident Evil aparece como "English" (verificado contra el archivo real: `en`, confianza 0,96).
- [ ] ~~Desde el control remoto atraso 1,5 s un subtítulo adelantado; al volver a abrir el video sigue sincronizado.~~ (part B withdrawn, see below)

> **Estado (2026-11-12):** part A (language) ✅ done. **Part B (sync) withdrawn on 2026-11-12:** the ↓ panel broke the native player's controls (the settings gear and the CC menu stopped showing). All sync code was removed from the API and the app, to be redesigned later. The `subtitle_offsets` table stays in migration 4, unused, because existing databases are already at v4.
>
> - **A · Idioma:** `lib/langDetect.js` propio (palabras frecuentes de es/en/pt/fr/it/de sobre ~200 líneas de diálogo; umbrales de cantidad, cobertura y margen → si no alcanza, `und`). Se descartó `franc-min`/`tinyld`: con subtítulos alcanza y no suma dependencias. Cache en SQLite (`subtitle_lang`, por ruta + mtime + tamaño; se leen como máximo 64 KB). El nombre gana; si contradice al contenido se loguea una vez. Probado con los 19 subtítulos de la biblioteca: todos correctos (Lupin dice `ITA.FRA` en el nombre, pero eso describe el audio y el subtítulo es español → `es`).
> - Etiqueta: se muestra "English" a secas también cuando es detectado (lo pide el criterio de aceptación); el origen va en `langSource: 'name' | 'content' | null`.
> - ~~**B · Sincronización:** `?offsetMs=` en `/media/:id/subtitles.vtt` (recorta al 0 y descarta cues que terminan antes). Ajuste guardado en `subtitle_offsets(item_id, sub_id)`, común a todos los perfiles, con `PUT /api/v1/items/:id/subtitles/:subId/offset`. La API lo devuelve en cada subtítulo (`offsetMs`) y ya aplicado en `url` → el reproductor web y el nativo lo usan sin hacer nada.~~
> - ~~**Reproductor nativo:** ↓ abre el panel; ←/→ ±0,5 s, ↑/↓ ±0,1 s, OK/Atrás cierra (se cierra solo a los 6 s). Ajusta el subtítulo activo, lo aplica 0,8 s después de la última tecla (recarga en la misma posición) y lo guarda en la API.~~
> - Pending: redesign sync so it doesn't take over the remote's ↓ key (e.g. as an option inside the player's settings menu).
