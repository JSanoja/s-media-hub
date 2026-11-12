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

const TIME_RE = /^((?:\d+:)?\d{1,2}:\d{2}\.\d{3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}\.\d{3})(.*)$/;

const toMs = (t) => {
  const [secs, ms] = t.split('.');
  return secs.split(':').reduce((acc, n) => acc * 60 + Number(n), 0) * 1000 + Number(ms);
};
const fromMs = (ms) => {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
};

/**
 * Desplaza todos los cues de un WebVTT (WU-18): positivo = más tarde (para un subtítulo adelantado),
 * negativo = antes. Los cues que terminan antes de 0 se descartan; los que empiezan antes, se recortan.
 */
export function shiftVtt(vtt, offsetMs) {
  if (!offsetMs) return vtt;
  const blocks = vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    const m = i >= 0 ? TIME_RE.exec(lines[i].trim()) : null;
    if (!m) {
      out.push(block); // cabecera, NOTE, STYLE
      continue;
    }
    const start = toMs(m[1]) + offsetMs;
    const end = toMs(m[2]) + offsetMs;
    if (end <= 0) continue;
    lines[i] = `${fromMs(Math.max(0, start))} --> ${fromMs(end)}${m[3]}`;
    out.push(lines.join('\n'));
  }
  return `${out.join('\n\n').trimEnd()}\n`;
}

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
