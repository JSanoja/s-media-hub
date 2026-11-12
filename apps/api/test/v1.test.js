// WU-05: API v1 (biblioteca, items, next) y /media (stream, thumbs, covers, subtítulos).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { createApp } from '../src/app.js';
import { createFfmpeg } from '../src/services/ffmpeg.js';
import { encodeId } from '../src/lib/ids.js';
import { parseTitleYear, parseEpisode, parseSeasonFolder } from '../src/lib/naming.js';
import { srtToVtt, subtitleLang, decodeSubtitle } from '../src/lib/subtitles.js';

const BASE_URL = 'http://192.168.0.50:3000';
const MOVIE = 'Resident Evil Afterlife (2010) [1080p]';
const MOVIE_FILE = 'Resident.Evil.Afterlife.2010.1080p.BrRip.x264.YIFY.mp4';
let tmp;
let media;
let server;
let base;

const SRT =
  '1\r\n00:00:01,000 --> 00:00:02,500\r\nHola señor\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nChau\r\n';

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'shub-v1-'));
  media = path.join(tmp, 'media');
  const sample = path.join(tmp, 'sample.mp4');
  await createFfmpeg().run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=10:duration=2',
    '-pix_fmt',
    'yuv420p',
    sample,
  ]);
  const files = {
    [`${MOVIE}/${MOVIE_FILE}`]: 'video',
    [`${MOVIE}/Resident.Evil.Afterlife.2010.1080p.BrRip.x264.YIFY.srt`]: SRT,
    [`${MOVIE}/cover.webp`]: 'img',
    'Silicon Valley/cover.jpg': 'img',
    'Silicon Valley/Temporada 1/Silicon.Valley.S01E01.720p.mp4': 'video',
    'Silicon Valley/Temporada 1/Silicon.Valley.S01E02.Titulo Bueno.mp4': 'video',
    'Silicon Valley/Temporada 1/Silicon.Valley.S01E02.Titulo Bueno.es.srt': Buffer.from(
      '1\r\n00:00:01,000 --> 00:00:02,000\r\nCanción\r\n',
      'latin1',
    ),
    'Silicon Valley/Temporada 1/Silicon.Valley.S01E10.mp4': 'video',
    'Silicon Valley/Temporada 2/Silicon.Valley.S02E01.mp4': 'video',
    'Serie Plana/cap1.mp4': 'video',
    'Serie Plana/cap10.mp4': 'video',
    'Serie Plana/cap2.mp4': 'video',
    'Varios/clip.mp4': 'video',
    'Varios/otro clip.mp4': 'video',
    'Varios/sin-cover/x.mp4': 'video',
    '.oculto/x.mp4': 'video',
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(media, rel);
    await mkdir(path.dirname(full), { recursive: true });
    if (content === 'video') await copyFile(sample, full);
    else await writeFile(full, content);
  }
  const app = createApp({
    tvDir: path.join(tmp, 'tv-no-compilada'),
    mediaRoot: media,
    cacheDir: path.join(tmp, 'cache'),
    thumbsDir: path.join(tmp, 'cache', 'thumbs'),
    publicBaseUrl: BASE_URL,
    castReceiverAppId: 'CC1AD845',
    corsOrigins: ['*'],
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

const id = (...segs) => encodeId(segs);
const json = async (url) => {
  const res = await fetch(base + url);
  return { status: res.status, body: await res.json(), headers: res.headers };
};
/** Convierte una URL absoluta (PUBLIC_BASE_URL) en una del server de test. */
const local = (absUrl) => absUrl.replace(BASE_URL, base);

// --- naming ---
test('parseTitleYear limpia nombres de release', () => {
  assert.deepEqual(parseTitleYear(MOVIE), { title: 'Resident Evil Afterlife', year: 2010 });
  assert.deepEqual(parseTitleYear(MOVIE_FILE), { title: 'Resident Evil Afterlife', year: 2010 });
  assert.deepEqual(parseTitleYear('Blade Runner 2049 (2017).mkv'), {
    title: 'Blade Runner 2049',
    year: 2017,
  });
  assert.deepEqual(parseTitleYear('Silicon Valley'), { title: 'Silicon Valley', year: null });
});

test('parseEpisode y parseSeasonFolder', () => {
  assert.equal(parseEpisode('Show.S02E05.mkv').episode, 5);
  assert.equal(parseEpisode('Show 1x07.mp4').season, 1);
  assert.equal(parseEpisode('Capítulo 3.mp4').episode, 3);
  assert.equal(parseEpisode('cap10.mp4').episode, 10);
  assert.equal(parseEpisode('Resident.Evil.Afterlife.2010.mp4'), null);
  assert.equal(parseSeasonFolder('Temporada 1'), 1);
  assert.equal(parseSeasonFolder('Season 02'), 2);
  assert.equal(parseSeasonFolder('S3'), 3);
  assert.equal(parseSeasonFolder('Varios'), null);
});

test('subtítulos: SRT → WebVTT, idioma y encoding', () => {
  const vtt = srtToVtt(SRT);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.match(vtt, /00:00:01\.000 --> 00:00:02\.500/);
  assert.ok(!vtt.includes('\r'));
  assert.deepEqual(subtitleLang('peli.es.srt', 'peli'), {
    lang: 'es',
    forced: false,
    label: 'Español',
  });
  assert.deepEqual(subtitleLang('peli.spa.forced.srt', 'peli'), {
    lang: 'es',
    forced: true,
    label: 'Español (forzados)',
  });
  assert.equal(subtitleLang('peli.srt', 'peli').lang, 'und');
  assert.equal(decodeSubtitle(Buffer.from('Canción', 'latin1')), 'Canción');
  assert.equal(decodeSubtitle(Buffer.from('Canción', 'utf8')), 'Canción');
});

// --- /api/v1/library ---
test('raíz: clasifica película, serie y carpeta, en orden natural, sin ocultos', async () => {
  const { status, body, headers } = await json('/api/v1/library');
  assert.equal(status, 200);
  assert.equal(headers.get('access-control-allow-origin'), '*');
  assert.equal(body.id, 'root');
  assert.equal(body.type, 'library');
  assert.equal(body.parentId, null);
  assert.deepEqual(
    body.folders.map((f) => [f.title, f.type]),
    [
      ['Resident Evil Afterlife', 'movie'],
      ['Serie Plana', 'series'],
      ['Silicon Valley', 'series'],
      ['Varios', 'folder'],
    ],
  );
  const movie = body.folders[0];
  assert.equal(movie.year, 2010);
  assert.equal(movie.itemId, id(MOVIE, MOVIE_FILE));
  assert.equal(movie.posterUrl, `${BASE_URL}/media/folders/${id(MOVIE)}/cover`);
  assert.equal(body.folders[3].posterUrl, null);
});

test('serie con temporadas → carpetas season', async () => {
  const { body } = await json(`/api/v1/library?path=${id('Silicon Valley')}`);
  assert.equal(body.type, 'series');
  assert.equal(body.parentId, 'root');
  assert.deepEqual(
    body.folders.map((f) => [f.title, f.type, f.season]),
    [
      ['Temporada 1', 'season', 1],
      ['Temporada 2', 'season', 2],
    ],
  );
});

test('temporada: episodios en orden natural con títulos', async () => {
  const { body } = await json(`/api/v1/library?path=${id('Silicon Valley', 'Temporada 1')}`);
  assert.equal(body.type, 'season');
  assert.deepEqual(
    body.items.map((i) => [i.type, i.series, i.season, i.episode, i.title]),
    [
      ['episode', 'Silicon Valley', 1, 1, 'Capítulo 1'],
      ['episode', 'Silicon Valley', 1, 2, 'Titulo Bueno'],
      ['episode', 'Silicon Valley', 1, 10, 'Capítulo 10'],
    ],
  );
  assert.ok(body.items.every((i) => i.streamUrl.startsWith(`${BASE_URL}/media/`)));
});

test('serie plana: cap1, cap2, cap10', async () => {
  const { body } = await json(`/api/v1/library?path=${id('Serie Plana')}`);
  assert.deepEqual(
    body.items.map((i) => i.episode),
    [1, 2, 10],
  );
});

// --- /api/v1/items ---
test('detalle de película: URLs absolutas, póster y subtítulos', async () => {
  const { status, body } = await json(`/api/v1/items/${id(MOVIE, MOVIE_FILE)}`);
  assert.equal(status, 200);
  assert.equal(body.type, 'movie');
  assert.equal(body.title, 'Resident Evil Afterlife');
  assert.equal(body.year, 2010);
  assert.equal(body.contentType, 'video/mp4');
  assert.equal(body.streamUrl, `${BASE_URL}/media/${body.id}`);
  assert.equal(body.thumbUrl, `${BASE_URL}/media/${body.id}/thumb.jpg`);
  assert.equal(body.posterUrl, `${BASE_URL}/media/folders/${id(MOVIE)}/cover`);
  assert.ok(body.size > 0);
  assert.equal(body.subtitles.length, 1);
  assert.equal(body.subtitles[0].lang, 'und');
  assert.match(body.subtitles[0].url, /\/subtitles\.vtt$/);
});

test('detalle de episodio: hereda el póster de la serie y encuentra su subtítulo', async () => {
  const { body } = await json(
    `/api/v1/items/${id('Silicon Valley', 'Temporada 1', 'Silicon.Valley.S01E02.Titulo Bueno.mp4')}`,
  );
  assert.equal(body.posterUrl, `${BASE_URL}/media/folders/${id('Silicon Valley')}/cover`);
  assert.equal(body.seriesId, id('Silicon Valley'));
  assert.deepEqual(
    body.subtitles.map((s) => s.lang),
    ['es'],
  );
  // El E01 no tiene subtítulo propio (hay varios videos en la carpeta).
  const e01 = await json(
    `/api/v1/items/${id('Silicon Valley', 'Temporada 1', 'Silicon.Valley.S01E01.720p.mp4')}`,
  );
  assert.deepEqual(e01.body.subtitles, []);
});

test('next: avanza en orden natural y cruza temporadas', async () => {
  const s1 = (f) => id('Silicon Valley', 'Temporada 1', f);
  let r = await json(`/api/v1/items/${s1('Silicon.Valley.S01E02.Titulo Bueno.mp4')}/next`);
  assert.equal(r.body.next.episode, 10);
  r = await json(`/api/v1/items/${s1('Silicon.Valley.S01E10.mp4')}/next`);
  assert.deepEqual([r.body.next.season, r.body.next.episode], [2, 1]);
  r = await json(
    `/api/v1/items/${id('Silicon Valley', 'Temporada 2', 'Silicon.Valley.S02E01.mp4')}/next`,
  );
  assert.equal(r.body.next, null);
  r = await json(`/api/v1/items/${id(MOVIE, MOVIE_FILE)}/next`);
  assert.equal(r.body.next, null);
});

test('ids inválidos o que no son videos', async () => {
  assert.equal((await json('/api/v1/items/!!!')).status, 400);
  assert.equal(
    (await json(`/api/v1/items/${Buffer.from('../x.mp4').toString('base64url')}`)).status,
    400,
  );
  assert.equal((await json(`/api/v1/items/${id('no', 'existe.mp4')}`)).status, 404);
  assert.equal((await json(`/api/v1/items/${id('Varios')}`)).status, 404);
  assert.equal((await json(`/api/v1/library?path=${id('.oculto')}`)).status, 400);
  assert.equal((await json('/api/v1/items/root')).status, 404);
});

// --- /media ---
test('stream con Range y CORS para el Chromecast', async () => {
  const { body } = await json(`/api/v1/items/${id(MOVIE, MOVIE_FILE)}`);
  const res = await fetch(local(body.streamUrl), { headers: { Range: 'bytes=0-99' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-expose-headers'), /Content-Range/);
  assert.equal((await res.arrayBuffer()).byteLength, 100);
});

test('preflight CORS (OPTIONS) con Range', async () => {
  const res = await fetch(`${base}/media/${id(MOVIE, MOVIE_FILE)}`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://www.gstatic.com', 'Access-Control-Request-Headers': 'range' },
  });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-headers'), /Range/);
});

test('subtítulos servidos como WebVTT (incluye .srt en latin1)', async () => {
  const { body } = await json(
    `/api/v1/items/${id('Silicon Valley', 'Temporada 1', 'Silicon.Valley.S01E02.Titulo Bueno.mp4')}`,
  );
  const res = await fetch(local(body.subtitles[0].url));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/vtt/);
  const text = await res.text();
  assert.ok(text.startsWith('WEBVTT'));
  assert.ok(text.includes('Canción'));
});

test('cover de carpeta y 404 si no tiene', async () => {
  const ok = await fetch(`${base}/media/folders/${id(MOVIE)}/cover`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/webp');
  assert.equal((await fetch(`${base}/media/folders/${id('Varios')}/cover`)).status, 404);
});

test('miniatura on-demand (se genera y luego sale del cache)', async () => {
  const url = `${base}/media/${id(MOVIE, MOVIE_FILE)}/thumb.jpg`;
  const first = await fetch(url);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('content-type'), 'image/jpeg');
  const second = await fetch(url);
  assert.equal(second.status, 200);
});

test('/media no sirve carpetas ni archivos no permitidos', async () => {
  assert.equal((await fetch(`${base}/media/${id('Varios')}`)).status, 400);
  assert.equal((await fetch(`${base}/media/${id(MOVIE, 'cover.webp')}`)).status, 415);
});

test('/tv sirve la interfaz compilada o explica cómo compilarla', async () => {
  const res = await fetch(`${base}/tv/`);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'TV_NOT_BUILT');
});
