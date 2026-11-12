# S-HUB — Plan de workunits

**Objetivo:** modernizar la API (`api-js-browser`), deprecar el front Angular 8 (`js-brwoser`) y construir un front nuevo que se reproduzca en el Google Chromecast.

Fecha del análisis: 2026-10-21 · Node instalado en la PC: v22.23.2 · ffmpeg del sistema disponible.

---

> **Decisión 2026-10-21:** el front nuevo es una **app propia en el Chromecast with Google TV 4K** (interfaz web para TV + app Android TV con reproductor nativo), en HTTP por LAN. Castear desde el celular queda opcional (WU-13).

## 1. Diagnóstico del estado actual

### API — `api-js-browser` (Express, último cambio real 2020, deps tocadas feb-2026)

| # | Hallazgo | Dónde | Severidad |
|---|----------|-------|-----------|
| A1 | **Path traversal**: `req.query.path` se concatena directo a `./public/source` → `?path=/../../..` lista cualquier carpeta del disco y `/api/thumb` ejecuta ffmpeg sobre cualquier archivo. | `routes/browse.js`, `routes/thumb.js` | 🔴 Crítica |
| A2 | **Variable global implícita**: `path = req.query.path ...` sin `let` → se comparte entre requests concurrentes (race condition). | `routes/browse.js:46` | 🔴 Crítica |
| A3 | `GET /` hace `res.render('index')` pero no hay view engine configurado → error 500 si llega a ejecutarse (hoy lo tapa `express.static`). | `routes/index.js` | 🟠 |
| A4 | Las miniaturas se generan **dentro de la carpeta de medios** (`video.mp4.jpg`) y **solo si hay más de 1 video** (`videos.length > 1`). Se disparan en cada request de browse, sin cola ni deduplicación. | `routes/browse.js` | 🟠 |
| A5 | `/api/thumb` no maneja el evento `error` de ffmpeg → el request queda colgado. Lógica duplicada con `browse.js`. | `routes/thumb.js` | 🟠 |
| A6 | Si la carpeta no tiene `cover.*`, responde `cover: "/source/<path>/undefined"`. | `routes/browse.js` | 🟡 |
| A7 | Detección de video con `name.includes("mp4")` (falla con `.MP4`, ignora `.mkv/.webm/.m4v`). Sin orden natural (cap10 antes que cap2). | `routes/browse.js` | 🟡 |
| A8 | Dependencias muertas o deprecadas: `ffmpeg@0.0.4`, `ffprobe`, `thumbsupply`, `cookie-parser` (sin uso); **`fluent-ffmpeg` está archivado/deprecado**; Express 4.16 y `debug@2` muy viejos; `nodemon` reemplazable por `node --watch`. | `package.json` | 🟠 |
| A9 | Los medios viven en `public/source` (acoplado al código, servidos por `express.static` sin CORS). No hay variables de entorno salvo `PORT`. | `app.js` | 🟠 |
| A10 | Sin CORS, sin URLs absolutas, sin metadatos (duración, códecs, mime) → **nada de esto sirve tal cual para Chromecast**, que necesita URLs alcanzables por IP de la LAN, CORS y formatos compatibles. | general | 🔴 para el objetivo |
| A11 | El README documenta una respuesta de `/api/browse` que **no coincide** con la real (`{path, folders, videos, cover}`). Pide "Node v25" (versión no LTS). | `README.md` | 🟡 |
| A12 | Sin tests, sin lint, sin logging estructurado, sin healthcheck. `public/` contiene el build compilado del front viejo. | general | 🟡 |

### Front — `js-brwoser` (Angular 8.2, nov-2019)

- Angular 8 / TypeScript 3.5 / `videogular2` (abandonado) / Protractor y TSLint (ambos discontinuados). Actualizarlo implica ~10 saltos de versión mayor: **no vale la pena**, se depreca como querés.
- Lógica útil a rescatar: navegación por carpetas, cover de fondo, grilla de carpetas con `cover.jpg`, reproducción directa de `/source/<path>`.
- Bugs conocidos: no hay botón "atrás" (`lastPath` se guarda pero no se usa), el reproductor se abre debajo de la grilla, sin nombre legible de episodios.

### Lo que implica Chromecast (restricciones clave)

1. **Un Chromecast "clásico" no corre apps solo**: siempre hay un *sender* (Chrome en la PC/Android) que navega la biblioteca y le manda al Chromecast qué reproducir. El *receiver* es la app web que se muestra en la TV.
2. **El Cast Web Sender SDK exige origen seguro (HTTPS o `localhost`)** y funciona en Chrome desktop y Chrome Android (no en iOS).
3. **Un Custom Web Receiver se hospeda en HTTPS** y se registra en la Google Cast SDK Developer Console (pago único de US$5). Chrome bloquea/auto-upgradea contenido mixto de audio/video, así que conviene servir **los medios también por HTTPS**.
4. El Chromecast no conoce `localhost`: la API tiene que exponer **URLs absolutas con la IP/host de la LAN** y responder con **CORS** y soporte de **HTTP Range**.
5. Formatos seguros: **MP4 H.264 + AAC** (universal), WebM VP8/VP9; HEVC y otros dependen del modelo. MKV/AVI/AC3/DTS requieren remux o transcodificación. Subtítulos: **WebVTT**.

---

## 2. Arquitectura objetivo

```
                         LAN (HTTPS, ej. https://flix.casa.lan:8443)
┌──────────────┐  browse/cast   ┌──────────────────────────┐   media (Range+CORS)  ┌───────────────┐
│ Sender (PWA) │ ─────────────▶ │ API S-HUB (Node 24 LTS)│ ◀──────────────────── │  Chromecast   │
│ Chrome PC /  │  Cast SDK      │ Express 5 · ESM          │                       │ Custom Web    │
│ Android      │ ═════════════▶ │ /api/v1/* · /media/*     │ ─── receiver HTML ──▶ │ Receiver (CAF)│
└──────────────┘                │ ffmpeg/ffprobe · SQLite  │                       └───────────────┘
                                └──────────────────────────┘
                                  MEDIA_ROOT = D:\Videos (fuera del repo)
```

Repositorio propuesto: un monorepo `s-hub` con npm workspaces → `apps/api`, `apps/sender`, `apps/receiver`, `packages/shared` (tipos del contrato). Los repos viejos quedan archivados.

---

## 3. Workunits

| ID | Workunit | Fase | Tamaño | Depende de |
|----|----------|------|--------|-----------|
| [WU-00](WU-00-decisiones-chromecast.md) | Decisiones: modelo de Chromecast y estrategia de cast | 0 · Decidir | S | — |
| [WU-01](WU-01-monorepo-y-tooling.md) | Monorepo, Node LTS y tooling base | 1 · Base | S | — |
| [WU-02](WU-02-api-modernizacion-deps.md) | Modernizar API: Express 5, ESM, limpiar dependencias | 1 · Base | M | WU-01 |
| [WU-03](WU-03-config-y-media-root.md) | Configuración por entorno y `MEDIA_ROOT` fuera del repo | 1 · Base | S | WU-02 |
| [WU-04](WU-04-seguridad.md) | Seguridad: path traversal, global implícita, validación | 1 · Base | S | WU-03 |
| [WU-05](WU-05-api-v1-contrato.md) | API v1: contrato nuevo de biblioteca y streaming | 2 · API | M | WU-04 |
| [WU-06](WU-06-thumbnails-y-metadatos.md) | Miniaturas, metadatos (ffprobe) e índice en SQLite | 2 · API | M | WU-05 |
| [WU-07](WU-07-https-cors-red-local.md) | HTTPS en la LAN, CORS y Range para Cast | 2 · API | M | WU-05, WU-00 |
| [WU-08](WU-08-compatibilidad-formatos.md) | Compatibilidad de formatos: remux/transcode y subtítulos VTT | 2 · API | L | WU-06 |
| [WU-09](WU-09-progreso-y-estado.md) | Historial: "Seguir viendo", marcar vistos (✓) y retomar | 2 · API | S | WU-06 |
| [WU-10](WU-10-calidad-tests-observabilidad.md) | Calidad: tests, lint, logging, OpenAPI | Transversal | M | WU-02 |
| [WU-11](WU-11-tv-ui.md) | Front nuevo: interfaz web para TV (control remoto) | 3 · Front | L | WU-05 |
| [WU-12](WU-12-android-tv-app.md) | App Android TV (WebView + reproductor nativo Media3) | 3 · Front | M | WU-11 |
| [WU-13](WU-13-cast-desde-celular-opcional.md) | (Opcional) Castear desde el celular / Custom Web Receiver | 4 · Extra | L | WU-07 (HTTPS) |
| [WU-14](WU-14-ejecucion-como-servicio.md) | Ejecutar la API como servicio en la PC | 4 · Ops | S | WU-07 |
| [WU-15](WU-15-deprecar-front-viejo.md) | Deprecar el front Angular y limpiar `public/` | 4 · Cierre | S | WU-11 |
| [WU-16](WU-16-validacion-e2e-y-docs.md) | Validación end-to-end en el Chromecast real y documentación | 4 · Cierre | S | todos |
| [WU-17](WU-17-ajustes-app.md) | Ajustes de la app persistentes (servidor, subtítulos) | 3 · App | S | WU-12 |
| [WU-18](WU-18-subtitulos-idioma-y-sincronizacion.md) | Subtítulos: detectar idioma y ajustar sincronización | 2 · API + App | M | WU-05, WU-12 |
| [WU-19](WU-19-dispositivos.md) | Registro de dispositivos activos + endpoint | 2 · API + App | S | base SQLite |
| [WU-20](WU-20-opensubtitles.md) | (Futuro) Addon de OpenSubtitles | 4 · Extra | M | WU-18 |
| [WU-21](WU-21-perfiles.md) | Perfiles con PIN: Obi, Papas, Invitados | 2 · API + Front | M | base SQLite |

### Camino crítico sugerido

```
WU-00 ─┐
WU-01 → WU-02 → WU-03 → WU-04 → WU-05 → WU-07 → WU-11 → WU-12 → WU-16
                                   └→ WU-06 → WU-08 / WU-09
WU-10 en paralelo desde WU-02 · WU-14 y WU-15 al final
```

**Hito 1 – "Castea algo" (rápido):** WU-01 → WU-05 + WU-07 + un sender mínimo de WU-11 usando el *Default Media Receiver* (sin registrar app). Valida red, HTTPS y formatos antes de invertir en UI.
**Hito 2 – "Experiencia S-HUB":** WU-06, WU-08, WU-09, WU-11 completo, WU-12.
**Hito 3 – "Cierre":** WU-14, WU-15, WU-16 (y WU-13 si aplica).

### Pedidos de Juan (2026-10-22) → workunits

| Pedido | WU |
|---|---|
| App 1 · Configuraciones guardadas (IP del servidor, etc.) | WU-17 |
| App 2 · Identificar lo que ya vi (✓, sin ocultarlo) | WU-09 |
| App 3 · Continuar viendo desde donde lo dejé | WU-09 |
| App 4 · Detectar el idioma real de los subtítulos | WU-18 (A) |
| App 5 · Adelantar/atrasar subtítulos | WU-18 (B) |
| API 1 · Addon OpenSubtitles | WU-20 |
| API 2 · Registrar dispositivos activos | WU-19 |
| API 3 · Endpoint de dispositivos activos | WU-19 |

| Perfiles Obi / Papas / Invitados con PIN | WU-21 |

**Decisión 2026-10-22:** persistencia con **SQLite embebido de Node (`node:sqlite`)**, un archivo `CACHE_DIR/shub.db`, sin servidor de base de datos (apto para el futuro servidor Linux local).

**Orden propuesto:** base SQLite (parte de WU-06) → **WU-21 perfiles** → **WU-09** → **WU-19** → **WU-18** → **WU-17** → WU-20.
