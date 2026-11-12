// WU-04: nada fuera de MEDIA_ROOT es accesible, ni por la API ni por /media ni vía ffmpeg.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { toSafeSegments, resolveInside } from '../src/lib/safePath.js';

let tmp;
let media;
let server;
let base;
let ffmpegCalls = 0;

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'shub-sec-'));
  media = path.join(tmp, 'media');
  await mkdir(path.join(media, 'peli'), { recursive: true });
  await writeFile(path.join(media, 'peli', 'video.mp4'), 'fake-video');
  await writeFile(path.join(media, 'peli', 'cover.webp'), 'img');
  await writeFile(path.join(media, 'peli', 'notas.txt'), 'no servible');
  await writeFile(path.join(media, '.env'), 'SECRETO=1');
  // Fuera de la biblioteca
  await writeFile(path.join(tmp, 'secreto.txt'), 'top secret');
  await writeFile(path.join(tmp, 'afuera.mp4'), 'fake');
  // Symlinks que intentan escapar (en Windows requieren permisos: se omiten si fallan)
  await symlink(tmp, path.join(media, 'escape-dir'), 'dir').catch(() => {});
  await symlink(path.join(tmp, 'afuera.mp4'), path.join(media, 'peli', 'link.mp4')).catch(() => {});

  const fakeFfmpeg = {
    probeDuration: async () => {
      ffmpegCalls++;
      return 1;
    },
    screenshot: async () => {
      ffmpegCalls++;
    },
  };
  const app = createApp(
    {
      mediaRoot: media,
      cacheDir: path.join(tmp, 'cache'),
      thumbsDir: path.join(tmp, 'cache', 'thumbs'),
      publicBaseUrl: 'http://192.168.0.50:3000',
      castReceiverAppId: 'CC1AD845',
      version: 'test',
      logFormat: 'off',
    },
    { ffmpeg: fakeFfmpeg },
  );
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  await rm(tmp, { recursive: true, force: true });
});

const get = (url) => fetch(base + url);

/** Id de una ruta CRUDA (sin validar), como lo armaría un atacante. */
const rawId = (rel) => Buffer.from(rel, 'utf8').toString('base64url');
const okId = (...segments) => rawId(segments.join('/'));

const traversal = [
  '..',
  '../',
  'peli/../..',
  '..\\..\\',
  'peli/..\\..',
  'C:\\Windows',
  'C:/Windows',
  '\\\\servidor\\share',
  '//servidor/share',
  'peli/\0',
  '.env',
];

for (const p of traversal) {
  test(`/api/v1/library rechaza ${JSON.stringify(p)}`, async () => {
    const res = await get(`/api/v1/library?path=${rawId(p)}`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_PATH');
  });
}

test('ids que no son base64url canónico → 400 INVALID_ID', async () => {
  for (const id of ['no/valido', 'a+b', `${rawId('peli')}=`, '%2e%2e']) {
    const res = await get(`/api/v1/library?path=${encodeURIComponent(id)}`);
    assert.equal(res.status, 400, id);
  }
});

test('/api/v1/library: "/etc" es relativo a la biblioteca, no el /etc del sistema', async () => {
  const res = await get(`/api/v1/library?path=${rawId('/etc')}`);
  assert.equal(res.status, 404);
});

test('/api/v1/library: un archivo no es una carpeta → 400', async () => {
  const res = await get(`/api/v1/library?path=${okId('peli', 'video.mp4')}`);
  assert.equal(res.status, 400);
});

test('/api/v1/library no lista archivos ocultos', async () => {
  const body = await (await get('/api/v1/library')).json();
  assert.ok(!JSON.stringify(body).includes('.env'));
});

test('/api/v1/library: symlink a carpeta externa → 404', async (t) => {
  const res = await get(`/api/v1/library?path=${okId('escape-dir')}`);
  if (res.status === 200) assert.fail('el symlink escapó de la biblioteca');
  if (res.status === 404) return;
  t.skip('symlink no soportado en este sistema');
});

test('/media/:id sirve solo videos de la biblioteca', async () => {
  assert.equal((await get(`/media/${okId('peli', 'video.mp4')}`)).status, 200);
  assert.equal((await get(`/media/${okId('peli', 'notas.txt')}`)).status, 415);
  assert.equal((await get(`/media/${okId('peli', 'cover.webp')}`)).status, 415, 'no es un video');
  for (const p of ['../secreto.txt', '..\\afuera.mp4', 'peli/../../secreto.txt', '.env']) {
    const res = await get(`/media/${rawId(p)}`);
    assert.equal(res.status, 400, p);
  }
  const link = await get(`/media/${okId('peli', 'link.mp4')}`);
  assert.notEqual(link.status, 200, 'symlink a archivo externo no se debe servir');
});

test('/media/:id/subtitles.vtt solo acepta subtítulos', async () => {
  assert.equal((await get(`/media/${okId('peli', 'notas.txt')}/subtitles.vtt`)).status, 415);
  assert.equal((await get(`/media/${rawId('../secreto.txt')}/subtitles.vtt`)).status, 400);
});

test('/media/:id/thumb.jpg: traversal y archivos fuera → nunca llega a ffmpeg', async () => {
  const before = ffmpegCalls;
  for (const p of [
    '../afuera.mp4',
    '..\\afuera.mp4',
    'C:\\x.mp4',
    'peli/link.mp4',
    'peli/notas.txt',
  ]) {
    const res = await get(`/media/${rawId(p)}/thumb.jpg`);
    assert.ok([400, 404, 415].includes(res.status), `${p} → ${res.status}`);
  }
  assert.equal(ffmpegCalls, before);
});

test('/media/:id/thumb.jpg: un video válido sí llega a ffmpeg', async () => {
  await get(`/media/${okId('peli', 'video.mp4')}/thumb.jpg`);
  assert.ok(ffmpegCalls > 0);
});

test('el front Angular viejo y las rutas legacy ya no existen (WU-15)', async () => {
  for (const url of [
    '/api/browse',
    '/api/thumb?path=/peli/video.mp4',
    '/source/peli/video.mp4',
    '/index.html',
    '/thumbs/x.jpg',
  ]) {
    assert.equal((await get(url)).status, 404, url);
  }
  const root = await get('/');
  assert.equal(root.status, 404, 'sin tvDir no hay a dónde redirigir');
});

test('/media/:id/thumb.jpg tiene rate limit', async () => {
  let last;
  for (let i = 0; i < 125; i++) last = await get(`/media/${okId('no.mp4')}/thumb.jpg`);
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('headers de seguridad (helmet) compatibles con Cast', async () => {
  const res = await get('/api/health');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('toSafeSegments normaliza separadores de Windows y Unix', () => {
  assert.deepEqual(toSafeSegments('/a/b\\c//d/./e'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(toSafeSegments(''), []);
  assert.throws(() => toSafeSegments(['x']));
});

test('resolveInside devuelve la ruta real dentro de la biblioteca', async () => {
  const real = await resolveInside(media, '/peli/video.mp4', { type: 'file' });
  assert.ok(real.endsWith(path.join('peli', 'video.mp4')));
});
