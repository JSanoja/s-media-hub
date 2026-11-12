// Interpretación de nombres de carpetas/archivos de la biblioteca → título, año, temporada, episodio.

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/** Orden natural: "cap2" antes que "cap10". */
export const naturalCompare = (a, b) => collator.compare(a, b);

// Tokens típicos de releases que no son parte del título.
const JUNK =
  /\b(2160p|1080p|720p|480p|4k|uhd|hdr|brrip|bdrip|bluray|blu-ray|web-?dl|webrip|hdtv|dvdrip|x264|x265|h\.?264|h\.?265|hevc|aac|ac3|dts|yify|yts|rarbg|proper|repack|extended|remastered|dual|latino|castellano|subs?)\b.*$/i;

const stripExt = (name) => name.replace(/\.[a-z0-9]{2,4}$/i, '');

const tidy = (s) =>
  s
    .replace(/[._]+/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s*-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Temporada a partir del nombre de una carpeta: "Temporada 1", "Season 02", "S1". */
export function parseSeasonFolder(name) {
  const m = /^(?:temporada|season|temp|s)[\s._-]*0*(\d{1,3})$/i.exec(name.trim());
  return m ? Number(m[1]) : null;
}

/** Episodio a partir de un nombre de archivo: S01E02, 1x02, "Capítulo 3", "Ep 4", "E05". */
export function parseEpisode(fileName) {
  const base = stripExt(fileName);
  let m = /\bS(\d{1,2})[\s._-]*E(\d{1,3})\b/i.exec(base);
  if (m)
    return { season: Number(m[1]), episode: Number(m[2]), rest: base.slice(m.index + m[0].length) };
  m = /\b(\d{1,2})x(\d{2,3})\b/i.exec(base);
  if (m)
    return { season: Number(m[1]), episode: Number(m[2]), rest: base.slice(m.index + m[0].length) };
  m = /\b(?:cap(?:[ií]tulo)?|episodio|episode|ep|e)[\s._-]*0*(\d{1,3})\b/i.exec(base);
  if (m) return { season: null, episode: Number(m[1]), rest: base.slice(m.index + m[0].length) };
  return null;
}

/** Título y año de una película (sirve para carpetas y archivos). */
export function parseTitleYear(name) {
  let base = stripExt(name);
  let year = null;
  // Prefiere el año entre paréntesis ("Blade Runner 2049 (2017)"); si no, el último ("Titulo.2010.1080p").
  const matches = [...base.matchAll(/[\s.([_-]((?:19|20)\d{2})(?=[\s.)\]_-]|$)/g)].filter(
    (m) => m.index > 0,
  );
  const m = matches.find((x) => x[0].startsWith('(')) ?? matches.at(-1);
  if (m) {
    year = Number(m[1]);
    base = base.slice(0, m.index);
  }
  base = base.replace(JUNK, '');
  return { title: tidy(base) || tidy(stripExt(name)), year };
}

/** Título "limpio" de una carpeta genérica o serie. */
export const parseFolderTitle = (name) => parseTitleYear(name);

/** Título de episodio: el texto después de SxxEyy, o "Capítulo N". */
export function episodeTitle(fileName, episode) {
  const ep = parseEpisode(fileName);
  const rest = ep ? tidy(ep.rest.replace(/^[\s._-]+/, '').replace(JUNK, '')) : '';
  return rest || `Capítulo ${episode}`;
}
