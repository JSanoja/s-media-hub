// WU-09: "Seguir viendo" y vistos ✓, separados por perfil. Lo visto nunca se oculta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { encodeId } from '../src/lib/ids.js';

let tmp;
let server;
let base;
const tokens = {};
const MOVIE = 'Peli (2010)';
const movieId = encodeId([MOVIE, 'peli.mp4']);
const ep = (s, e) => encodeId(['Serie', `Temporada ${s}`, `Serie.S0${s}E0${e}.mp4`]);

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'shub-hist-'));
  const media = path.join(tmp, 'media');
  for (const f of [
    `${MOVIE}/peli.mp4`,
    'Serie/Temporada 1/Serie.S01E01.mp4',
    'Serie/Temporada 1/Serie.S01E02.mp4',
    'Serie/Temporada 2/Serie.S02E01.mp4',
  ]) {
    await mkdir(path.dirname(path.join(media, f)), { recursive: true });
    await writeFile(path.join(media, f), 'video');
  }
  const app = createApp({
    publicDir: tmp,
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
  for (const [id, pin] of [
    ['obi', '7890'],
    ['papas', '5555'],
  ]) {
    const res = await fetch(`${base}/api/v1/profiles/${id}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, deviceId: 'test-device-01' }),
    });
    tokens[id] = (await res.json()).token;
  }
});
after(async () => {
  server?.close();
  await rm(tmp, { recursive: true, force: true });
});

const call = async (method, url, { body, as } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(as ? { 'X-Profile-Token': tokens[as] } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const report = (as, id, positionSec, durationSec = 600, extra = {}) =>
  call('PUT', `/api/v1/items/${id}/progress`, {
    as,
    body: { positionSec, durationSec, deviceId: 'tv-001', ...extra },
  });

test('sin perfil: progress es null y el historial pide perfil', async () => {
  const item = await call('GET', `/api/v1/items/${movieId}`);
  assert.equal(item.body.progress, null);
  assert.equal((await call('GET', '/api/v1/continue-watching')).status, 401);
  assert.equal((await report(undefined, movieId, 10)).status, 401);
});

test('reportar a medias → "Seguir viendo" y progress en detalle y listados', async () => {
  const r = await report('obi', movieId, 125.5);
  assert.equal(r.status, 200);
  assert.deepEqual(
    { ...r.body, updatedAt: undefined },
    { positionSec: 125.5, durationSec: 600, watched: false, updatedAt: undefined },
  );
  const cw = await call('GET', '/api/v1/continue-watching', { as: 'obi' });
  assert.deepEqual(
    cw.body.map((i) => [i.id, i.progress.positionSec]),
    [[movieId, 125.5]],
  );
  const item = await call('GET', `/api/v1/items/${movieId}`, { as: 'obi' });
  assert.equal(item.body.progress.positionSec, 125.5);
  const folder = await call('GET', `/api/v1/library?path=${encodeId([MOVIE])}`, { as: 'obi' });
  assert.equal(folder.body.items[0].progress.positionSec, 125.5);
});

test('cada perfil tiene su propio historial', async () => {
  const cw = await call('GET', '/api/v1/continue-watching', { as: 'papas' });
  assert.deepEqual(cw.body, []);
  const item = await call('GET', `/api/v1/items/${movieId}`, { as: 'papas' });
  assert.equal(item.body.progress, null);
});

test('menos de 30 s no entra en "Seguir viendo"', async () => {
  await report('papas', ep(1, 1), 12);
  const cw = await call('GET', '/api/v1/continue-watching', { as: 'papas' });
  assert.deepEqual(cw.body, []);
});

test('al pasar el 90 % queda visto ✓, la posición vuelve a 0 y sigue apareciendo en la temporada', async () => {
  const r = await report('papas', ep(1, 1), 545, 600);
  assert.equal(r.body.watched, true);
  assert.equal(r.body.positionSec, 0);
  const season = await call('GET', `/api/v1/library?path=${encodeId(['Serie', 'Temporada 1'])}`, {
    as: 'papas',
  });
  assert.equal(season.body.items.length, 2, 'lo visto no se oculta');
  assert.deepEqual(
    season.body.items.map((i) => i.progress?.watched ?? false),
    [true, false],
  );
});

test('ended:true marca visto aunque falte la duración', async () => {
  const r = await report('papas', ep(1, 2), 3, 0, { ended: true });
  assert.equal(r.body.watched, true);
});

test('watchedCount en las carpetas (la serie cuenta todas sus temporadas)', async () => {
  const root = await call('GET', '/api/v1/library', { as: 'papas' });
  const serie = root.body.folders.find((f) => f.title === 'Serie');
  assert.equal(serie.videoCount, 3);
  assert.equal(serie.watchedCount, 2);
  assert.ok(!('videoIds' in serie), 'videoIds no sale en el JSON');
  const rootObi = await call('GET', '/api/v1/library', { as: 'obi' });
  assert.equal(rootObi.body.folders.find((f) => f.title === 'Serie').watchedCount, 0);
  const anon = await call('GET', '/api/v1/library');
  assert.equal(anon.body.folders.find((f) => f.title === 'Serie').watchedCount, undefined);
});

test('volver a ver algo visto: conserva el ✓ y guarda la posición', async () => {
  const r = await report('papas', ep(1, 1), 200, 600);
  assert.equal(r.body.watched, true);
  assert.equal(r.body.positionSec, 200);
  const cw = await call('GET', '/api/v1/continue-watching', { as: 'papas' });
  assert.ok(cw.body.some((i) => i.id === ep(1, 1)));
});

test('marcar / desmarcar visto a mano', async () => {
  const on = await call('POST', `/api/v1/items/${ep(2, 1)}/watched`, { as: 'obi' });
  assert.equal(on.body.watched, true);
  const off = await call('DELETE', `/api/v1/items/${ep(2, 1)}/watched`, { as: 'obi' });
  assert.equal(off.body.watched, false);
});

test('next incluye el progreso del perfil', async () => {
  const r = await call('GET', `/api/v1/items/${ep(1, 1)}/next`, { as: 'papas' });
  assert.equal(r.body.next.id, ep(1, 2));
  assert.equal(r.body.next.progress.watched, true);
});

test('validaciones: posición inválida → 400, video inexistente → 404', async () => {
  assert.equal((await report('obi', movieId, -5)).status, 400);
  assert.equal(
    (
      await call('PUT', `/api/v1/items/${movieId}/progress`, {
        as: 'obi',
        body: { positionSec: 'x' },
      })
    ).status,
    400,
  );
  assert.equal((await report('obi', encodeId(['no', 'existe.mp4']), 10)).status, 404);
});
