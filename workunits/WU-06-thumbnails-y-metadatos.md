# WU-06 · Miniaturas, metadatos (ffprobe) e índice en SQLite

**Fase:** 2 · API · **Tamaño:** M · **Depende de:** WU-05

## Hallazgos que resuelve
A4, A5, A8 (reemplazo de fluent-ffmpeg).

## Tareas
### Wrapper ffmpeg propio
- [ ] `services/ffmpeg.js`: `probe(file)` → `ffprobe -v error -print_format json -show_format -show_streams`; `screenshot(file, atSec, out)` → `ffmpeg -ss <t> -i <file> -frames:v 1 -vf scale=640:-2 -q:v 3 <out>`.
- [ ] Timeouts, kill del proceso en shutdown, captura de stderr para logs.

### Miniaturas
- [ ] Generación **on-demand** en `GET /media/:id/thumb.jpg`: si existe en `CACHE_DIR` se sirve; si no, se genera y se sirve (sin colgar el request: manejar `error`).
- [ ] Cola con concurrencia limitada (ej. 2 procesos) y **deduplicación** (misma miniatura pedida 10 veces = 1 proceso).
- [ ] Frame al ~10 % de la duración (evita negros/intro) en vez del default.
- [ ] Eliminar la generación disparada desde el browse y la condición `videos.length > 1`.

### Metadatos e índice
- [ ] Escáner de biblioteca (al arrancar + endpoint `POST /api/v1/admin/rescan` + opcional `fs.watch`) que guarda en **SQLite** (`node:sqlite` nativo en Node 22.13+/24, o `better-sqlite3`): ruta, id, tamaño, mtime, duración, códecs de video/audio, resolución, subtítulos encontrados.
- [ ] Re-probe solo si cambió `mtime`/`size`.
- [ ] Calcular `castCompatible` a partir de códecs (regla en WU-08).

## Criterios de aceptación
- [ ] Abrir una carpeta con 50 episodios no lanza 50 ffmpeg en paralelo.
- [ ] La biblioteca (MEDIA_ROOT) no recibe ningún archivo nuevo.
- [ ] Listar una carpeta ya indexada responde en < 100 ms.
