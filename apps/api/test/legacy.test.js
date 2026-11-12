import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createFfmpeg } from '../src/services/ffmpeg.js';

let server;
let base;
let publicDir;
let sourceDir;
let cacheDir;

before(async () => {
  publicDir = await mkdtemp(path.join(tmpdir(), 'shub-'));
  sourceDir = path.join(publicDir, 'source');
  cacheDir = path.join(publicDir, 'cache');
  const season = path.join(sourceDir, 'serie', 'season1');
  await mkdir(season, { recursive: true });
  await writeFile(path.join(sourceDir, 'cover.jpg'), 'fake');

  // Dos videos reales de 2 s generados con ffmpeg (lavfi).
  const ffmpeg = createFfmpeg();
  for (const name of ['cap1.mp4', 'cap2.mp4']) {
    await ffmpeg.run((await import('ffmpeg-static')).default, [
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
      path.join(season, name),
    ]);
  }

  const app = createApp({
    publicDir,
    mediaRoot: sourceDir,
    cacheDir,
    thumbsDir: path.join(cacheDir, 'thumbs'),
    publicBaseUrl: 'http://192.168.0.50:3000',
    castReceiverAppId: 'CC1AD845',
    version: 'test',
    logFormat: 'off',
  });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await rm(publicDir, { recursive: true, force: true });
});

const getJson = async (url) => {
  const res = await fetch(base + url);
  return { status: res.status, body: await res.json() };
};

const waitFor = async (fn, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

test('GET /api/health', async () => {
  const { status, body } = await getJson('/api/health');
  assert.equal(status, 200);
  assert.deepEqual(body, { status: 'ok' });
});

test('GET /api/browse en la raíz mantiene el contrato legacy', async () => {
  const { status, body } = await getJson('/api/browse');
  assert.equal(status, 200);
  assert.deepEqual(body, { path: '', folders: ['serie'], videos: [], cover: '/source/cover.jpg' });
});

test('GET /api/browse lista videos y genera miniaturas faltantes', async () => {
  const { body } = await getJson('/api/browse?path=/serie/season1');
  assert.deepEqual(body.videos.sort(), ['cap1.mp4', 'cap2.mp4']);
  const thumbs = path.join(cacheDir, 'thumbs', 'serie', 'season1');
  const ok = await waitFor(async () => {
    const files = await readdir(thumbs).catch(() => []);
    return files.filter((f) => f.endsWith('.mp4.jpg')).length === 2;
  });
  assert.ok(ok, 'se esperaban 2 miniaturas .mp4.jpg en el cache');
  const inMedia = await readdir(path.join(sourceDir, 'serie', 'season1'));
  assert.ok(!inMedia.some((f) => f.endsWith('.jpg')), 'no se debe escribir en MEDIA_ROOT');
});

test('requests concurrentes no mezclan el path (bug A2 de la global implícita)', async () => {
  const paths = ['', '/serie', '/serie/season1', '/serie', ''];
  const results = await Promise.all(paths.map((p) => getJson(`/api/browse?path=${p}`)));
  results.forEach((r, i) => assert.equal(r.body.path, paths[i]));
});

test('GET /api/thumb genera la miniatura y responde', async () => {
  const file = path.join(cacheDir, 'thumbs', 'serie', 'season1', 'cap1.mp4.jpg');
  await rm(file, { force: true });
  const res = await fetch(`${base}/api/thumb?path=/serie/season1/cap1.mp4`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'sucess');
  assert.ok(existsSync(file));
});

test('GET /api/thumb con archivo inexistente responde 404 JSON (no se cuelga)', async () => {
  const { status, body } = await getJson('/api/thumb?path=/no/existe.mp4');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('ruta inexistente → 404 JSON', async () => {
  const { status, body } = await getJson('/api/nada');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('/source sirve videos con soporte de Range (206)', async () => {
  const res = await fetch(`${base}/source/serie/season1/cap1.mp4`, {
    headers: { Range: 'bytes=0-99' },
  });
  assert.equal(res.status, 206);
  assert.equal((await res.arrayBuffer()).byteLength, 100);
});

test('/thumbs sirve las miniaturas del cache', async () => {
  const res = await fetch(`${base}/thumbs/serie/season1/cap1.mp4.jpg`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
});

test('GET /api/v1/config expone solo la config pública', async () => {
  const { status, body } = await getJson('/api/v1/config');
  assert.equal(status, 200);
  assert.deepEqual(body, {
    publicBaseUrl: 'http://192.168.0.50:3000',
    castReceiverAppId: 'CC1AD845',
    version: 'test',
  });
});
