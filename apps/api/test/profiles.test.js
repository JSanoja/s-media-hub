// WU-21: perfiles Obi / Papas / Invitados con PIN.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { openDb } from '../src/services/db.js';
import { createProfiles, parseProfilePins } from '../src/services/profiles.js';

let tmp;
let server;
let base;
let clock = 1_000_000;

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'shub-prof-'));
  const db = openDb(path.join(tmp, 'cache', 'shub.db'));
  const profiles = createProfiles({
    db,
    seedPins: { obi: '7890', papas: '5555', invitados: '1111' },
    now: () => clock,
  });
  const app = createApp(
    {
      publicDir: tmp,
      mediaRoot: tmp,
      cacheDir: path.join(tmp, 'cache'),
      thumbsDir: path.join(tmp, 'cache', 'thumbs'),
      publicBaseUrl: 'http://192.168.1.5:30001',
      castReceiverAppId: 'CC1AD845',
      version: 'test',
      logFormat: 'off',
    },
    { db, profiles },
  );
  await new Promise((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${server.address().port}`;
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
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};
const login = (id, pin, deviceId = 'tv-living-0001') =>
  call('POST', `/api/v1/profiles/${id}/session`, { body: { pin, deviceId } });

test('lista los 3 perfiles en orden y sin PIN', async () => {
  const { status, body } = await call('GET', '/api/v1/profiles');
  assert.equal(status, 200);
  assert.deepEqual(
    body.map((p) => p.name),
    ['Obi', 'Papas', 'Invitados'],
  );
  assert.ok(body.every((p) => !('pin' in p) && !('pin_hash' in p) && p.color));
});

test('PINs por defecto: Obi 7890, Papas 5555, Invitados 1111', async () => {
  for (const [id, pin] of [
    ['obi', '7890'],
    ['papas', '5555'],
    ['invitados', '1111'],
  ]) {
    const { status, body } = await login(id, pin, `dev-${id}-123`);
    assert.equal(status, 201, id);
    assert.equal(body.profile.id, id);
    assert.ok(body.token.length >= 40);
  }
});

test('el token identifica el perfil (/me) y se puede cerrar sesión', async () => {
  const { body } = await login('papas', '5555');
  const me = await call('GET', '/api/v1/profiles/me', { token: body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.name, 'Papas');
  assert.equal(
    (await call('DELETE', '/api/v1/profiles/session', { token: body.token })).status,
    204,
  );
  assert.equal((await call('GET', '/api/v1/profiles/me', { token: body.token })).status, 401);
});

test('sin token o con token inválido → 401 PROFILE_REQUIRED', async () => {
  assert.equal((await call('GET', '/api/v1/profiles/me')).body.error.code, 'PROFILE_REQUIRED');
  assert.equal((await call('GET', '/api/v1/profiles/me', { token: 'x'.repeat(43) })).status, 401);
});

test('PIN incorrecto → 401 con intentos restantes; 5 fallos → bloqueo 60 s (429)', async () => {
  const dev = 'tv-bloqueo-0001';
  let r;
  for (let i = 1; i <= 4; i++) {
    r = await login('obi', '0000', dev);
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'INVALID_PIN');
    assert.equal(r.body.error.attemptsLeft, 5 - i);
  }
  r = await login('obi', '0000', dev);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '60');
  // Bloqueado incluso con el PIN correcto…
  assert.equal((await login('obi', '7890', dev)).status, 429);
  // …pero otro dispositivo no queda bloqueado.
  assert.equal((await login('obi', '7890', 'otro-dispositivo-01')).status, 201);
  // Pasado el minuto, vuelve a funcionar.
  clock += 61_000;
  assert.equal((await login('obi', '7890', dev)).status, 201);
});

test('validaciones: formato de PIN y perfil inexistente', async () => {
  assert.equal((await login('obi', '12')).body.error.code, 'INVALID_PIN_FORMAT');
  assert.equal((await login('obi', 'abcd')).status, 400);
  assert.equal((await login('nadie', '1234')).status, 404);
});

test('cambiar PIN: requiere el actual, invalida el viejo y cierra sesiones', async () => {
  const { body: s } = await login('invitados', '1111');
  const bad = await call('PUT', '/api/v1/profiles/invitados/pin', {
    body: { currentPin: '9999', newPin: '2222', deviceId: 'cambio-pin-001' },
  });
  assert.equal(bad.status, 401);
  const ok = await call('PUT', '/api/v1/profiles/invitados/pin', {
    body: { currentPin: '1111', newPin: '2222', deviceId: 'cambio-pin-001' },
  });
  assert.equal(ok.status, 204);
  assert.equal((await login('invitados', '1111')).status, 401);
  assert.equal((await login('invitados', '2222')).status, 201);
  assert.equal((await call('GET', '/api/v1/profiles/me', { token: s.token })).status, 401);
});

test('la siembra no pisa un PIN ya cambiado (reinicio de la API)', () => {
  const db = openDb(':memory:');
  const a = createProfiles({ db, seedPins: { obi: '7890' } });
  a.changePin('obi', '7890', '4321', { clientKey: 'k' });
  const b = createProfiles({ db, seedPins: { obi: '7890' } }); // "reinicio"
  assert.ok(b.login('obi', '4321', { clientKey: 'k2' }).token);
  assert.throws(() => b.login('obi', '7890', { clientKey: 'k3' }), /PIN incorrecto/);
});

test('el PIN se guarda hasheado, nunca en texto plano', () => {
  const db = openDb(':memory:');
  createProfiles({ db, seedPins: { papas: '5555' } });
  const row = db.prepare("SELECT * FROM profiles WHERE id = 'papas'").get();
  assert.ok(!JSON.stringify(row).includes('5555'));
  assert.equal(row.pin_hash.length, 64);
});

test('PROFILE_PINS se parsea y valida', () => {
  assert.deepEqual(parseProfilePins('obi:1234, Papas:0000'), { obi: '1234', papas: '0000' });
  assert.throws(() => parseProfilePins('obi:12'), /4 dígitos/);
});

test('CORS permite el header X-Profile-Token', async () => {
  const res = await fetch(`${base}/api/v1/profiles/me`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://x', 'Access-Control-Request-Headers': 'x-profile-token' },
  });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-headers'), /X-Profile-Token/);
});
