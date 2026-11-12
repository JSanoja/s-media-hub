// WU-18: idioma de los subtítulos por contenido y ajuste de sincronización por video.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { encodeId } from '../src/lib/ids.js';
import { detectLanguage, dialogueLines } from '../src/lib/langDetect.js';
import { shiftVtt } from '../src/lib/subtitles.js';

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
const subId = encodeId([movie, 'Peli.2010.srt']);
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
const local = (url) => url.replace('http://192.168.1.5:30001', '');

// --- Parte A: idioma ---

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

// --- Parte B: sincronización ---

test('shiftVtt: desplaza, recorta al 0 y descarta lo que queda antes', () => {
  const vtt =
    'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nUno\n\n2\n00:00:10.500 --> 00:00:12.000 align:start\nDos\n\n3\n01:00:00.000 --> 01:00:01.000\nTres\n';
  const late = shiftVtt(vtt, 1500);
  assert.match(late, /00:00:02\.500 --> 00:00:03\.500\nUno/);
  assert.match(late, /00:00:12\.000 --> 00:00:13\.500 align:start\nDos/);
  assert.match(late, /01:00:01\.500 --> 01:00:02\.500\nTres/);
  const early = shiftVtt(vtt, -2000);
  assert.ok(!early.includes('Uno'), 'termina en 0 → fuera');
  assert.match(early, /00:00:08\.500 --> 00:00:10\.000 align:start\nDos/);
  assert.match(
    shiftVtt(vtt, -1500),
    /00:00:00\.000 --> 00:00:00\.500\nUno/,
    'empieza antes de 0 → recortado',
  );
  assert.match(shiftVtt(vtt, -10_800), /00:00:00\.000 --> 00:00:01\.200 align:start\nDos/);
  assert.equal(shiftVtt(vtt, 0), vtt);
});

test('GET subtitles.vtt?offsetMs desplaza los tiempos y valida el valor', async () => {
  const plain = await call('GET', `/media/${subId}/subtitles.vtt`);
  assert.match(plain.text, /00:00:10\.000 --> 00:00:12\.000/);
  const shifted = await call('GET', `/media/${subId}/subtitles.vtt?offsetMs=-1500`);
  assert.match(shifted.text, /00:00:08\.500 --> 00:00:10\.500/);
  for (const bad of ['abc', '1.5', '600001']) {
    const r = await call('GET', `/media/${subId}/subtitles.vtt?offsetMs=${bad}`);
    assert.equal(r.status, 400, bad);
    assert.equal(r.body.error.code, 'INVALID_OFFSET');
  }
});

test('PUT offset se guarda por video y viaja en el item (URL incluida)', async () => {
  const put = await call('PUT', `/api/v1/items/${itemId}/subtitles/${subId}/offset`, {
    offsetMs: 1500,
  });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body, { offsetMs: 1500 });

  const item = await call('GET', `/api/v1/items/${itemId}`);
  assert.equal(item.body.subtitles[0].offsetMs, 1500);
  assert.match(item.body.subtitles[0].url, /subtitles\.vtt\?offsetMs=1500$/);
  const vtt = await call('GET', local(item.body.subtitles[0].url));
  assert.match(vtt.text, /00:00:11\.500 --> 00:00:13\.500/);

  // Volver a 0 borra el ajuste y la URL queda limpia.
  await call('PUT', `/api/v1/items/${itemId}/subtitles/${subId}/offset`, { offsetMs: 0 });
  const again = await call('GET', `/api/v1/items/${itemId}`);
  assert.equal(again.body.subtitles[0].offsetMs, 0);
  assert.match(again.body.subtitles[0].url, /subtitles\.vtt$/);
});

test('PUT offset: 404 si el subtítulo no es del video, 400 si el valor es inválido', async () => {
  const other = await call(
    'PUT',
    `/api/v1/items/${itemId}/subtitles/${series('Serie.S01E01.srt')}/offset`,
    { offsetMs: 100 },
  );
  assert.equal(other.status, 404);
  const bad = await call('PUT', `/api/v1/items/${itemId}/subtitles/${subId}/offset`, {
    offsetMs: 'mucho',
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_OFFSET');
});
