// WU-04: nada fuera de MEDIA_ROOT es accesible, ni por la API ni por /source ni vía ffmpeg.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
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
      publicDir: path.join(tmp, 'public'),
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
// Petición con la ruta CRUDA (sin la normalización de fetch/URL), como la mandaría un atacante.
const raw = (rawPath) =>
  new Promise((resolve, reject) => {
    const { port } = server.address();
    http
      .get({ host: '127.0.0.1', port, path: rawPath }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on('error', reject);
  });
const enc = encodeURIComponent;

const traversal = [
  '/..',
  '/../',
  '/peli/../..',
  '..\\..\\',
  '/peli/..\\..',
  'C:\\Windows',
  'C:/Windows',
  '\\\\servidor\\share',
  '//servidor/share',
  '/peli/\0',
];

for (const p of traversal) {
  test(`/api/browse rechaza ${JSON.stringify(p)}`, async () => {
    const res = await get(`/api/browse?path=${enc(p)}`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_PATH');
  });
}

test('/api/browse: rutas con "/" inicial son relativas a la biblioteca (/etc ≠ /etc del sistema)', async () => {
  const res = await get(`/api/browse?path=${enc('/etc')}`);
  assert.equal(res.status, 404);
});

test('/api/browse: un archivo no es una carpeta → 400', async () => {
  const res = await get(`/api/browse?path=${enc('/peli/video.mp4')}`);
  assert.equal(res.status, 400);
});

test('/api/browse: path como array (?path=a&path=b) no rompe nada', async () => {
  const res = await get('/api/browse?path=/peli&path=/..');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).path, '');
});

test('/api/browse no lista archivos ocultos', async () => {
  const res = await get('/api/browse');
  const body = await res.json();
  assert.ok(!JSON.stringify(body).includes('.env'));
});

test('/api/browse: symlink a carpeta externa → 404', async (t) => {
  const res = await get(`/api/browse?path=${enc('/escape-dir')}`);
  if (res.status === 200) assert.fail('el symlink escapó de la biblioteca');
  if (res.status === 404) return;
  t.skip('symlink no soportado en este sistema');
});

test('/api/thumb: traversal y archivos fuera → nunca llega a ffmpeg', async () => {
  const before = ffmpegCalls;
  for (const p of ['/../afuera.mp4', '..\\afuera.mp4', 'C:\\x.mp4', '/peli/link.mp4']) {
    const res = await get(`/api/thumb?path=${enc(p)}`);
    assert.ok([400, 404].includes(res.status), `${p} → ${res.status}`);
  }
  assert.equal(ffmpegCalls, before);
});

test('/api/thumb: solo videos (extensión permitida) → 415 para otros', async () => {
  const res = await get(`/api/thumb?path=${enc('/peli/notas.txt')}`);
  assert.equal(res.status, 415);
});

test('/api/thumb: un video válido sí llega a ffmpeg', async () => {
  const res = await get(`/api/thumb?path=${enc('/peli/video.mp4')}`);
  assert.equal(res.status, 200);
  assert.ok(ffmpegCalls > 0);
});

test('/source sirve solo archivos permitidos', async () => {
  assert.equal((await get('/source/peli/video.mp4')).status, 200);
  assert.equal((await get('/source/peli/cover.webp')).status, 200);
  assert.equal((await get('/source/peli/notas.txt')).status, 415);
  assert.equal((await get('/source/.env')).status, 400);
  for (const p of [
    '/source/peli/../../secreto.txt',
    '/source/peli/%2e%2e/%2e%2e/secreto.txt',
    '/source/peli/..%2f..%2fsecreto.txt',
    '/source/peli/..%5c..%5csecreto.txt',
    '/source/..%5cafuera.mp4',
  ]) {
    const status = await raw(p);
    assert.ok([400, 403, 404].includes(status), `${p} → ${status}`);
  }
  assert.equal((await get('/source/%E0%A4%A')).status, 400);
  const link = await get('/source/peli/link.mp4');
  assert.notEqual(link.status, 200, 'symlink a archivo externo no se debe servir');
});

test('/api/thumb tiene rate limit', async () => {
  let last;
  for (let i = 0; i < 35; i++) last = await get(`/api/thumb?path=${enc('/no.mp4')}`);
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
