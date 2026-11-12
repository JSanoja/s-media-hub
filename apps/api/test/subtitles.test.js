// WU-18: idioma de los subtítulos por contenido.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { encodeId } from '../src/lib/ids.js';
import { detectLanguage, dialogueLines } from '../src/lib/langDetect.js';

const EN = [
  "I don't know what you want from me.",
  'We have to get out of here right now.',
  'Where is the rest of your team?',
  'They are all dead. It was the virus.',
  'You should have told me about this.',
  'I can not do this without you, Claire.',
  "Come on, we're going to the ship.",
  'What are they doing up there?',
];
const ES = [
  'No sé qué quieres de mí.',
  'Tenemos que salir de aquí ahora mismo.',
  '¿Dónde está el resto de tu equipo?',
  'Están todos muertos. Fue el virus.',
  'Deberías haberme dicho esto.',
  'No puedo hacer esto sin ti, Claire.',
  'Vamos, nos vamos al barco.',
  '¿Qué están haciendo allá arriba?',
];
/** SRT de n cues con las líneas dadas (repetidas). */
const srt = (lines, n = 30) =>
  Array.from({ length: n }, (_, i) => {
    const s = 10 + i * 3;
    return `${i + 1}\n00:00:${String(s).padStart(2, '0')},000 --> 00:00:${String(s + 2).padStart(2, '0')},000\n<i>${lines[i % lines.length]}</i>`;
  }).join('\n\n');

let tmp;
let server;
let base;
const movie = 'Peli (2010)';
const itemId = encodeId([movie, 'Peli.2010.mp4']);
const series = (f) => encodeId(['Serie', 'Temporada 1', f]);

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'shub-subs-'));
  const media = path.join(tmp, 'media');
  await mkdir(path.join(media, movie), { recursive: true });
  await mkdir(path.join(media, 'Serie', 'Temporada 1'), { recursive: true });
  await writeFile(path.join(media, movie, 'Peli.2010.mp4'), 'video');
  await writeFile(path.join(media, movie, 'Peli.2010.srt'), srt(EN)); // sin idioma en el nombre
  const ep = path.join(media, 'Serie', 'Temporada 1');
  await writeFile(path.join(ep, 'Serie.S01E01.mp4'), 'video');
  await writeFile(path.join(ep, 'Serie.S01E01.srt'), srt(ES));
  await writeFile(path.join(ep, 'Serie.S01E01.en.srt'), srt(ES)); // el nombre gana
  await writeFile(
    path.join(ep, 'Serie.S01E01.forced.srt'),
    '1\n00:00:01,000 --> 00:00:02,000\n¡Ey!',
  );
  const app = createApp({
    mediaRoot: media,
    cacheDir: path.join(tmp, 'cache'),
    thumbsDir: path.join(tmp, 'cache', 'thumbs'),
    dbPath: path.join(tmp, 'cache', 'shub.db'),
    publicBaseUrl: 'http://192.168.1.5:30001',
    castReceiverAppId: 'CC1AD845',
    version: 'test',
    logFormat: 'off',
  });
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  await rm(tmp, { recursive: true, force: true });
});

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* no es JSON */
  }
  return { status: res.status, body: json, text };
};

test('detectLanguage: inglés, español y null si es poco o ambiguo', () => {
  assert.equal(detectLanguage(srt(EN)).lang, 'en');
  assert.equal(detectLanguage(srt(ES)).lang, 'es');
  assert.equal(detectLanguage(srt(['¡Ey!', 'Ok.'], 5)), null, 'poco texto');
  assert.equal(detectLanguage(srt(['1234 5678 xyzzy qwerty'], 60)), null, 'sin palabras conocidas');
});

test('dialogueLines descarta números, tiempos, etiquetas y acotaciones', () => {
  const lines = dialogueLines(
    'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n<i>{\\an8}Hola</i> [música]\n',
  );
  assert.deepEqual(lines, ['Hola']);
});

test('item: idioma por contenido si el nombre no lo dice; el nombre gana; forced sin texto → und', async () => {
  const peli = await call('GET', `/api/v1/items/${itemId}`);
  assert.deepEqual(
    peli.body.subtitles.map(({ lang, label, langSource }) => ({ lang, label, langSource })),
    [{ lang: 'en', label: 'English', langSource: 'content' }],
  );
  const ep = await call('GET', `/api/v1/items/${series('Serie.S01E01.mp4')}`);
  const byFile = Object.fromEntries(ep.body.subtitles.map((s) => [s.id, s]));
  assert.equal(byFile[series('Serie.S01E01.srt')].label, 'Español');
  assert.equal(byFile[series('Serie.S01E01.en.srt')].lang, 'en', 'el nombre gana al contenido');
  assert.equal(byFile[series('Serie.S01E01.en.srt')].langSource, 'name');
  assert.equal(byFile[series('Serie.S01E01.forced.srt')].lang, 'und');
  assert.equal(byFile[series('Serie.S01E01.forced.srt')].label, 'Subtítulos (forzados)');
});
