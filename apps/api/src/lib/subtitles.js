// Subtítulos: el Chromecast solo acepta WebVTT, así que los .srt se convierten al vuelo.

const LANGS = {
  es: 'Español',
  spa: 'Español',
  esp: 'Español',
  en: 'English',
  eng: 'English',
  pt: 'Português',
  por: 'Português',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
  und: 'Subtítulos',
};
const ISO = { spa: 'es', esp: 'es', eng: 'en', por: 'pt', fre: 'fr', fra: 'fr', ita: 'it' };

/** Idioma a partir del sufijo: "peli.es.srt" → es, "peli.spa.forced.srt" → es, "peli.srt" → und */
export function subtitleLang(subName, videoBase) {
  const stem = subName.replace(/\.(srt|vtt)$/i, '');
  const suffix = stem.startsWith(videoBase) ? stem.slice(videoBase.length) : stem;
  const tokens = suffix
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  const code = tokens.find((t) => LANGS[t]);
  const lang = code ? (ISO[code] ?? code) : 'und';
  const forced = tokens.includes('forced');
  return { lang, forced, label: subtitleLabel(lang, forced) };
}

/** "English", "Español (forzados)", "Subtítulos" (und). */
export const subtitleLabel = (lang, forced = false) =>
  `${LANGS[lang] ?? lang}${forced ? ' (forzados)' : ''}`;

/** Decodifica texto de subtítulos: UTF-8 si es válido, si no Windows-1252 (típico de .srt viejos). */
export function decodeSubtitle(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** SRT → WebVTT. */
export function srtToVtt(srt) {
  const body = srt
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}
