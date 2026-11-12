// Contrato de la API v1 compartido entre API, sender y receiver (WU-05).
// Tipos en JSDoc para tener autocompletado sin build de TypeScript.

export const API_VERSION = 'v1';
export const ROOT_ID = 'root';
/** Default Media Receiver de Google (mientras no haya receiver propio, WU-12). */
export const DEFAULT_MEDIA_RECEIVER_APP_ID = 'CC1AD845';

export const FOLDER_TYPES = /** @type {const} */ ([
  'library',
  'folder',
  'movie',
  'series',
  'season',
]);
export const ITEM_TYPES = /** @type {const} */ (['movie', 'episode', 'video']);

/**
 * @typedef {object} PublicConfig  GET /api/v1/config
 * @property {string} publicBaseUrl      p. ej. "http://192.168.0.50:3000"
 * @property {string} castReceiverAppId
 * @property {string} version
 */

/**
 * @typedef {object} Subtitle
 * @property {string} id
 * @property {string} lang    ISO 639-1 ("es", "en") o "und"
 * @property {string} label   "Español", "English (forzados)", ...
 * @property {'name'|'content'|null} langSource  idioma por nombre ("peli.es.srt"), detectado por contenido, o null (WU-18)
 * @property {number} offsetMs  ajuste de sincronización guardado para este video (0 = ninguno)
 * @property {string} url     WebVTT absoluto (incluye ?offsetMs= si hay ajuste)
 */

/**
 * @typedef {object} Progress  Historial del perfil activo (WU-09)
 * @property {number} positionSec    0 si ya se terminó
 * @property {number|null} durationSec
 * @property {boolean} watched       ✓ visto (no se oculta en ningún listado)
 * @property {string} updatedAt      ISO
 */

/**
 * @typedef {object} Item  GET /api/v1/items/:id (en listados vienen sin size/posterUrl/subtitles)
 * @property {string} id
 * @property {'movie'|'episode'|'video'} type
 * @property {string|null} title
 * @property {number|null} year
 * @property {string} fileName
 * @property {string} folderId
 * @property {string} contentType      "video/mp4", ...
 * @property {string} streamUrl        absoluto, soporta Range
 * @property {string} thumbUrl
 * @property {string|null} posterUrl
 * @property {number|null} durationSec    (WU-06)
 * @property {boolean|null} castCompatible (WU-06/08)
 * @property {Progress|null} progress  (WU-09, requiere header X-Profile-Token)
 * @property {string} [series]
 * @property {string} [seriesId]
 * @property {number} [season]
 * @property {number} [episode]
 * @property {number} [size]
 * @property {Subtitle[]} [subtitles]
 */

/**
 * @typedef {object} FolderSummary
 * @property {string} id
 * @property {'folder'|'movie'|'series'|'season'} type
 * @property {string} title
 * @property {number|null} year
 * @property {string|null} posterUrl
 * @property {number} videoCount       (en series incluye todas las temporadas)
 * @property {number} [watchedCount]   (WU-09, con perfil)
 * @property {number} [season]
 * @property {string} [itemId]   solo películas: id del video para reproducir directo
 */

/**
 * @typedef {object} Folder  GET /api/v1/library?path=<id>
 * @property {string} id
 * @property {'library'|'folder'|'movie'|'series'|'season'} type
 * @property {string} title
 * @property {number|null} year
 * @property {string|null} parentId
 * @property {string|null} posterUrl
 * @property {FolderSummary[]} folders
 * @property {Item[]} items
 */

/**
 * @typedef {object} NowPlaying  Lo que reproduce un dispositivo activo (WU-19)
 * @property {string} itemId
 * @property {number} positionSec
 * @property {boolean} paused
 * @property {string} updatedAt   ISO
 * @property {string|null} [title]
 * @property {'movie'|'episode'|'video'|null} [type]
 * @property {string|null} [series]
 * @property {number|null} [season]
 * @property {number|null} [episode]
 */

/**
 * @typedef {object} Device  GET /api/v1/devices[?active=1] · POST /api/v1/devices/heartbeat
 * @property {string} id                 deviceId generado por la app (8–64 [A-Za-z0-9_-])
 * @property {string} name
 * @property {'android-tv'|'browser'} kind
 * @property {string|null} model
 * @property {string|null} appVersion
 * @property {string|null} ip            IP desde la conexión (no la informa el cliente)
 * @property {{id: string, name: string, color: string}|null} profile   perfil con sesión en el dispositivo
 * @property {string} firstSeen          ISO
 * @property {string} lastSeen           ISO
 * @property {boolean} active            último heartbeat hace < DEVICE_ACTIVE_SECONDS (120 s)
 * @property {NowPlaying|null} nowPlaying   solo si está activo
 */
