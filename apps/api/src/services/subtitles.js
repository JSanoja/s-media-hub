// Subtítulos (WU-18): idioma por contenido con cache en SQLite, y ajuste de sincronización
// guardado por video (se aplica a todos los perfiles: el desfase es del archivo, no de quien mira).
import { open } from 'node:fs/promises';
import { decodeSubtitle } from '../lib/subtitles.js';
import { detectLanguage } from '../lib/langDetect.js';
import { HttpError } from '../lib/errors.js';

/** ±10 min: más que eso no es un desfase, es otro subtítulo. */
export const MAX_OFFSET_MS = 600_000;
/** Con 64 KB hay de sobra para ~200 líneas de diálogo. */
const SAMPLE_BYTES = 64 * 1024;

export function parseOffset(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || Math.abs(n) > MAX_OFFSET_MS) {
    throw new HttpError(
      400,
      'INVALID_OFFSET',
      `offsetMs debe ser un entero entre -${MAX_OFFSET_MS} y ${MAX_OFFSET_MS}`,
    );
  }
  return n;
}

export function createSubtitles({ db, log = console, now = () => Date.now() }) {
  const q = {
    lang: db.prepare('SELECT * FROM subtitle_lang WHERE path = ?'),
    saveLang: db.prepare(`
      INSERT INTO subtitle_lang (path, mtime_ms, size, lang, confidence) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET mtime_ms = excluded.mtime_ms, size = excluded.size,
        lang = excluded.lang, confidence = excluded.confidence`),
    offsets: db.prepare('SELECT sub_id, offset_ms FROM subtitle_offsets WHERE item_id = ?'),
    saveOffset: db.prepare(`
      INSERT INTO subtitle_offsets (item_id, sub_id, offset_ms, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(item_id, sub_id) DO UPDATE SET offset_ms = excluded.offset_ms,
        updated_at = excluded.updated_at`),
    deleteOffset: db.prepare('DELETE FROM subtitle_offsets WHERE item_id = ? AND sub_id = ?'),
  };

  /** Idioma del contenido de un archivo (cacheado por ruta + mtime + tamaño) → lang o null. */
  async function detect(absPath) {
    const fh = await open(absPath, 'r');
    try {
      const { mtimeMs, size } = await fh.stat();
      const mtime = Math.trunc(mtimeMs);
      const cached = q.lang.get(absPath);
      if (cached && cached.mtime_ms === mtime && cached.size === size) {
        return { lang: cached.lang, fresh: false };
      }
      const buf = Buffer.alloc(Math.min(size, SAMPLE_BYTES));
      await fh.read(buf, 0, buf.length, 0);
      const result = detectLanguage(decodeSubtitle(buf));
      q.saveLang.run(absPath, mtime, size, result?.lang ?? null, result?.confidence ?? null);
      return { lang: result?.lang ?? null, fresh: true };
    } finally {
      await fh.close();
    }
  }

  return {
    /** Para la biblioteca: idioma detectado o null (si falla la lectura, null). */
    async detectLang(absPath, { nameLang } = {}) {
      const { lang, fresh } = await detect(absPath).catch(() => ({ lang: null, fresh: false }));
      // Se avisa una sola vez (al analizar), no en cada listado.
      if (fresh && lang && nameLang && nameLang !== 'und' && nameLang !== lang) {
        log.warn?.(
          `[subtítulos] el nombre dice "${nameLang}" pero el contenido parece "${lang}": ${absPath}`,
        );
      }
      return lang;
    },

    /** Map subId → offsetMs de un video. */
    offsetsFor(itemId) {
      return new Map(q.offsets.all(itemId).map((r) => [r.sub_id, r.offset_ms]));
    },

    setOffset(itemId, subId, offsetMs) {
      if (offsetMs === 0) q.deleteOffset.run(itemId, subId);
      else q.saveOffset.run(itemId, subId, offsetMs, now());
      return offsetMs;
    },
  };
}
