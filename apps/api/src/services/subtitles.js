// Subtítulos (WU-18): idioma por contenido con cache en SQLite.
import { open } from 'node:fs/promises';
import { decodeSubtitle } from '../lib/subtitles.js';
import { detectLanguage } from '../lib/langDetect.js';

/** Con 64 KB hay de sobra para ~200 líneas de diálogo. */
const SAMPLE_BYTES = 64 * 1024;

export function createSubtitles({ db, log = console }) {
  const q = {
    lang: db.prepare('SELECT * FROM subtitle_lang WHERE path = ?'),
    saveLang: db.prepare(`
      INSERT INTO subtitle_lang (path, mtime_ms, size, lang, confidence) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET mtime_ms = excluded.mtime_ms, size = excluded.size,
        lang = excluded.lang, confidence = excluded.confidence`),
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
  };
}
