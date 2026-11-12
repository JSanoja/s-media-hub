// WU-19: registro de dispositivos y cuáles están activos (con lo que están viendo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { openDb } from '../src/services/db.js';
import { createDevices } from '../src/services/devices.js';
import { encodeId } from '../src/lib/ids.js';
import { loadConfig } from '../src/config.js';

let tmp;
let server;
let base;
let clock = Date.parse('2026-11-12T20:00:00Z');
let obiToken;
const episodeId = encodeId(['Serie', 'Temporada 1', 'Serie.S01E02.mp4']);

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'shub-dev-'));
  const media = path.join(tmp, 'media');
  await mkdir(path.join(media, 'Serie', 'Temporada 1'), { recursive: true });
  await writeFile(path.join(media, 'Serie', 'Temporada 1', 'Serie.S01E02.mp4'), 'video');
  const db = openDb(':memory:');
  const app = createApp(
    {
      mediaRoot: media,
      cacheDir: path.join(tmp, 'cache'),
      thumbsDir: path.join(tmp, 'cache', 'thumbs'),
      publicBaseUrl: 'http://192.168.1.5:30001',
      castReceiverAppId: 'CC1AD845',
      version: 'test',
      logFormat: 'off',
    },
    { db, devices: createDevices({ db, activeSeconds: 120, now: () => clock }) },
  );
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/v1/profiles/obi/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '7890', deviceId: 'tv-chromecast-01' }),
  });
  obiToken = (await res.json()).token;
});
after(async () => {
  server?.close();
  await rm(tmp, { recursive: true, force: true });
});

const call = async (method, url, { body, token } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Profile-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const beat = (body, token) => call('POST', '/api/v1/devices/heartbeat', { body, token });

test('heartbeat registra el dispositivo con IP, perfil y lo que reproduce', async () => {
  const r = await beat(
    {
      deviceId: 'tv-chromecast-01',
      kind: 'android-tv',
      model: 'Chromecast',
      appVersion: '0.1.0',
      nowPlaying: { itemId: episodeId, positionSec: 125.5, paused: false },
    },
    obiToken,
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Chromecast', 'sin nombre → el modelo');
  assert.equal(r.body.kind, 'android-tv');
  assert.equal(r.body.ip, '127.0.0.1', 'sin el prefijo ::ffff:');
  assert.equal(r.body.active, true);
  assert.deepEqual(r.body.profile, { id: 'obi', name: 'Obi', color: '#ff5a36' });
  assert.equal(r.body.nowPlaying.itemId, episodeId);
  assert.equal(r.body.nowPlaying.positionSec, 125.5);
  assert.equal(r.body.nowPlaying.paused, false);
  assert.equal(r.body.nowPlaying.type, 'episode');
  assert.equal(r.body.nowPlaying.season, 1);
  assert.equal(r.body.nowPlaying.episode, 2);
});

test('sin token el dispositivo queda sin perfil; sin nowPlaying deja de reproducir', async () => {
  const r = await beat({ deviceId: 'tv-chromecast-01', kind: 'android-tv', model: 'Chromecast' });
  assert.equal(r.body.profile, null);
  assert.equal(r.body.nowPlaying, null);
});

test('GET /devices lista todos y ?active=1 solo los de los últimos 2 min', async () => {
  await beat({ deviceId: 'browser-pc-0001', name: 'Chrome en la PC' });
  clock += 100_000; // 100 s después: los dos siguen activos
  assert.equal((await call('GET', '/api/v1/devices?active=1')).body.length, 2);

  await beat(
    { deviceId: 'tv-chromecast-01', kind: 'android-tv', nowPlaying: { itemId: episodeId } },
    obiToken,
  );
  clock += 30_000; // la PC lleva 130 s sin heartbeat → inactiva; la TV 30 s → activa
  const all = await call('GET', '/api/v1/devices');
  assert.equal(all.body.length, 2);
  assert.equal(all.body[0].id, 'tv-chromecast-01', 'ordenados por último heartbeat');
  const active = await call('GET', '/api/v1/devices?active=1');
  assert.deepEqual(
    active.body.map((d) => d.id),
    ['tv-chromecast-01'],
  );
  assert.equal(active.body[0].nowPlaying.itemId, episodeId);
  assert.equal(active.body[0].firstSeen < active.body[0].lastSeen, true);

  clock += 200_000; // TV cerrada: deja de estar activa y ya no informa qué reproduce
  const later = await call('GET', '/api/v1/devices');
  assert.equal(later.body.find((d) => d.id === 'tv-chromecast-01').active, false);
  assert.equal(later.body.find((d) => d.id === 'tv-chromecast-01').nowPlaying, null);
  assert.deepEqual((await call('GET', '/api/v1/devices?active=1')).body, []);
});

test('heartbeat valida deviceId, kind y nowPlaying', async () => {
  for (const body of [
    {},
    { deviceId: 'corto' },
    { deviceId: '../../etc/passwd' },
    { deviceId: 'device-00001', kind: 'tostadora' },
    { deviceId: 'device-00001', nowPlaying: { positionSec: 3 } },
    { deviceId: 'device-00001', nowPlaying: { itemId: 'x', positionSec: -1 } },
  ]) {
    const r = await beat(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.error.code, 'INVALID_DEVICE');
  }
});

test('nombre y modelo se recortan y limpian', async () => {
  const r = await beat({
    deviceId: 'device-long-name',
    name: `  ${'x'.repeat(100)}\u0007 `,
    kind: 'browser',
  });
  assert.equal(r.body.name.length, 60);
  assert.equal(r.body.model, null);
});

test('DELETE /devices/:id olvida el dispositivo', async () => {
  assert.equal((await call('DELETE', '/api/v1/devices/browser-pc-0001')).status, 204);
  assert.equal((await call('DELETE', '/api/v1/devices/browser-pc-0001')).status, 404);
  const ids = (await call('GET', '/api/v1/devices')).body.map((d) => d.id);
  assert.equal(ids.includes('browser-pc-0001'), false);
});

test('DEVICE_ACTIVE_SECONDS se configura y valida por env', () => {
  const env = { MEDIA_ROOT: path.join(tmp, 'media'), CACHE_DIR: path.join(tmp, 'cache') };
  assert.equal(loadConfig(env).deviceActiveSeconds, 120);
  assert.equal(loadConfig({ ...env, DEVICE_ACTIVE_SECONDS: '300' }).deviceActiveSeconds, 300);
  assert.throws(
    () => loadConfig({ ...env, DEVICE_ACTIVE_SECONDS: 'dos' }),
    /DEVICE_ACTIVE_SECONDS/,
  );
});
