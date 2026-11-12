// Detección del idioma de un subtítulo por su contenido (WU-18), sin dependencias: cuenta palabras
// muy frecuentes ("stopwords") de cada idioma en ~200 líneas de diálogo. Con subtítulos alcanza y
// sobra; si el resultado no es claro devuelve null (→ "und").

const STOPWORDS = {
  en: `the and you to of is that it in me my we what this for are have be your not was with on he
    she they do don know just get can all there here how why who will would could gonna want
    been his her him them our us got going right come about out up yes yeah okay`,
  es: `que el la los las y en un una es por con para lo se te mi tu está pero como sí bien eso
    esto aquí ahora vamos tengo puedo nada todo señor porque cuando muy también ya del al más
    hay estoy eres soy tiene quiero sé usted ella él nosotros qué cómo dónde puede`,
  pt: `não o os as é um uma você eu isso com para mas como meu minha aqui agora vamos tem sim
    obrigado muito também ele ela nós do da no na está estou ser foi vai pode quero sei então
    seu sua isto aqui onde porque bem`,
  fr: `le les des du et est je il elle nous vous qui pas ne une ce pour avec mais oui non suis
    sont ça moi toi bien très où dans sur au aux mon ma tes ses fait faire veux peux sais était
    rien tout quoi comme`,
  it: `il lo gli di che è non per ma sono sei io lui lei noi voi questo quello cosa come qui ora
    bene grazie perché anche molto della dello sto hai ho mio mia tuo cosí niente tutto dove
    voglio posso`,
  de: `der die das und ist ich du er sie wir ihr nicht ein eine zu mit auf für es was wie ja
    nein mein dein hier jetzt auch aber sind bin haben kann den dem sich wird war noch nur`,
};
const SETS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words.split(/\s+/))]),
);

const MAX_LINES = 200;
const MIN_HITS = 20;
const MIN_COVERAGE = 0.12;
const MIN_MARGIN = 1.4;

/** Líneas de diálogo de un SRT/VTT: sin cabecera, números, tiempos, etiquetas ni notas. */
export function dialogueLines(text, max = MAX_LINES) {
  const out = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw
      .replace(/<[^>]*>/g, '') // <i>, <font …>
      .replace(/\{[^}]*\}/g, '') // {\an8}
      .replace(/\[[^\]]*\]|\([^)]*\)/g, '') // [música], (risas)
      .trim();
    if (!line || /^\d+$/.test(line) || line.includes('-->') || /^(WEBVTT|NOTE|STYLE)\b/.test(line))
      continue;
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

/** → { lang, confidence } o null si no hay texto suficiente o el resultado es ambiguo. */
export function detectLanguage(text) {
  const words =
    dialogueLines(text)
      .join(' ')
      .toLowerCase()
      .match(/\p{L}+/gu) ?? [];
  if (words.length < MIN_HITS) return null;
  const scores = Object.entries(SETS)
    .map(([lang, set]) => [lang, words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0)])
    .sort((a, b) => b[1] - a[1]);
  const [[lang, best], [, second]] = scores;
  const coverage = best / words.length;
  if (best < MIN_HITS || coverage < MIN_COVERAGE || best < second * MIN_MARGIN) return null;
  return { lang, confidence: Math.round(Math.min(1, (best - second) / best) * 100) / 100 };
}
