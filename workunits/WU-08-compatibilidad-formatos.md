# WU-08 · Compatibilidad de formatos: remux/transcode y subtítulos VTT

**Fase:** 2 · API · **Tamaño:** L · **Depende de:** WU-06

## Contexto
Hoy solo se listan `.mp4`. El Chromecast reproduce de forma confiable **MP4 (H.264 + AAC)** y WebM (VP8/VP9 + Opus/Vorbis). HEVC/H.265, 4K, HDR y Dolby dependen del modelo (Ultra / Google TV). MKV como contenedor, AC3/DTS y subtítulos SRT/ASS **no** son confiables.

## Estrategia por niveles
| Caso | Acción | Costo |
|---|---|---|
| MP4 H.264 + AAC | Servir directo | 0 |
| MKV con H.264 + AAC | **Remux** a MP4 (`-c copy -movflags +faststart`) | segundos |
| H.264 con audio AC3/DTS/EAC3 | Copiar video, transcodificar solo audio a AAC | bajo |
| HEVC / códecs no soportados | Transcodificar a H.264 (offline) o HLS on-the-fly | alto |
| MP4 sin `faststart` | Remux con `+faststart` (mejora inicio y seek) | segundos |

## Tareas
- [ ] Matriz de compatibilidad configurable según el modelo (WU-00) → calcula `castCompatible` y `action` por item.
- [ ] **Fase A (offline)**: comando `npm run media:prepare` que recorre la biblioteca y genera versiones compatibles en `CACHE_DIR/transcoded/` (cola, progreso, reanudable). La API sirve la versión preparada si existe.
- [ ] **Fase B (opcional, on-the-fly)**: HLS con ffmpeg (`-f hls`, segmentos de 6 s) en `/media/:id/hls/index.m3u8` para casos sin preparar; con aceleración por GPU si la PC tiene (NVENC/QSV/AMF).
- [ ] **Subtítulos**: detectar `.srt/.ass` sidecar (`cap1.es.srt`) y pistas embebidas; convertir a **WebVTT** (`ffmpeg -i x.srt x.vtt`) y exponer como `tracks` del `MediaInfo`.
- [ ] Selección de pista de audio por idioma si hay varias.

## Criterios de aceptación
- [ ] Un `.mkv` H.264/AC3 de la biblioteca se reproduce en el Chromecast con audio.
- [ ] Subtítulos en español se pueden activar desde el sender.

> **Dispositivo confirmado 2026-10-21:** Chromecast with Google TV **4K** (`sabrina`, Android TV 14). Directo por hardware: H.264, HEVC (≤4K60), VP9, HDR10/HDR10+/Dolby Vision; audio AAC/Opus/AC3/EAC3 (passthrough). **No AV1** → AV1 requiere transcode. Si el front termina siendo app Android TV con ExoPlayer/Media3 (WU-13), MKV se reproduce sin remux.
