# WU-20 · (Futuro) Addon de OpenSubtitles

**Fase:** 4 · Extra · **Tamaño:** M · **Depende de:** WU-18 · **Pedido de Juan 2026-10-22:** API #1.

## Viabilidad
Sí. OpenSubtitles tiene una API REST oficial (api.opensubtitles.com, v1) que requiere una **API key gratuita** (registro como desarrollador) y, para descargar, **login** de una cuenta (las cuentas gratis tienen un cupo diario de descargas). Hay que confirmar límites y términos vigentes al implementarlo.

## Diseño (pluggable)
- Interfaz `SubtitleProvider { search(item) → candidatos; download(candidato) → archivo }`; OpenSubtitles es el primer proveedor (se pueden sumar otros).
- Búsqueda por **hash del archivo** (algoritmo de OpenSubtitles: tamaño + 64 KB del inicio y del final, preciso para el release exacto) y, de respaldo, por título/año/temporada/episodio.
- Descargas a `CACHE_DIR/subtitles/` (nunca en `MEDIA_ROOT`), luego aparecen como un subtítulo más del item (con idioma ya conocido).
- Config por env: `OPENSUBTITLES_API_KEY`, `OPENSUBTITLES_USERNAME`, `OPENSUBTITLES_PASSWORD`, `SUBTITLE_LANGS=es,en`. Sin key → el addon queda desactivado.
- Endpoints: `GET /api/v1/items/:id/subtitles/search?lang=es` → candidatos; `POST /api/v1/items/:id/subtitles/download` `{ candidateId }`.
- (Opcional) Automático: al reproducir un video sin subtítulo en el idioma preferido, buscar y bajar el mejor candidato por hash.

## App
- En el detalle/reproductor: "Buscar subtítulos…" → lista de candidatos (idioma, release, descargas) → elegir → se agrega y se activa.

## Criterios de aceptación
- [ ] Un video sin `.srt` → "Buscar subtítulos" → elijo uno en español → se reproduce con él, y queda guardado para la próxima vez.
