import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig, detectLanIPv4, ConfigError, apiRoot } from '../src/config.js';

let tmp;
let media;
const lan = () => ({
  lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  docker: [{ family: 'IPv4', address: '172.17.0.1', internal: false }],
  eth: [{ family: 'IPv4', address: '192.168.0.50', internal: false }],
});
const noLan = () => ({ lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] });
const load = (env, nets = lan) =>
  loadConfig({ MEDIA_ROOT: media, ...env }, { networkInterfaces: nets });

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'shub-cfg-'));
  media = path.join(tmp, 'media');
  await mkdir(media);
});
after(() => rm(tmp, { recursive: true, force: true }));

test('defaults: http, 0.0.0.0:3000, IP de la LAN autodetectada, Default Media Receiver', () => {
  const c = load({});
  assert.equal(c.protocol, 'http');
  assert.equal(c.host, '0.0.0.0');
  assert.equal(c.port, 3000);
  assert.equal(c.publicBaseUrl, 'http://192.168.0.50:3000');
  assert.equal(c.publicHostSource, 'autodetectado');
  assert.equal(c.castReceiverAppId, 'CC1AD845');
  assert.deepEqual(c.corsOrigins, ['*']);
  assert.deepEqual(c.warnings, []);
});

test('MEDIA_ROOT por defecto es apps/api/public/source y CACHE_DIR la carpeta cache del repo', () => {
  const c = loadConfig({}, { networkInterfaces: lan });
  assert.equal(c.mediaRoot, path.join(apiRoot, 'public', 'source'));
  assert.equal(c.cacheDir, path.resolve(apiRoot, '..', '..', 'cache'));
  assert.equal(c.thumbsDir, path.join(c.cacheDir, 'thumbs'));
});

test('PUBLIC_HOST y PUBLIC_PORT arman la URL pública', () => {
  const c = load({ PUBLIC_HOST: '10.0.0.7', PORT: '8080', PUBLIC_PORT: '80' });
  assert.equal(c.port, 8080);
  assert.equal(c.publicBaseUrl, 'http://10.0.0.7'); // 80 es el default de http
  assert.equal(c.publicHostSource, 'PUBLIC_HOST');
});

test('PUBLIC_BASE_URL gana sobre todo y se normaliza', () => {
  const c = load({ PUBLIC_HOST: '10.0.0.7', PUBLIC_BASE_URL: 'http://flix.casa:3000/' });
  assert.equal(c.publicBaseUrl, 'http://flix.casa:3000');
});

test('pasar a HTTPS es solo configuración', async () => {
  const cert = path.join(tmp, 'c.pem');
  const key = path.join(tmp, 'k.pem');
  await writeFile(cert, 'x');
  await writeFile(key, 'x');
  const c = load({
    PROTOCOL: 'https',
    PUBLIC_HOST: 'flix.ejemplo.com',
    PUBLIC_PORT: '443',
    TLS_CERT: cert,
    TLS_KEY: key,
  });
  assert.equal(c.publicBaseUrl, 'https://flix.ejemplo.com');
  assert.deepEqual(c.tls, { cert, key });
});

test('HTTPS sin certificados falla con mensaje claro', () => {
  assert.throws(
    () => load({ PROTOCOL: 'https' }),
    (e) => e instanceof ConfigError && /TLS_CERT y TLS_KEY/.test(e.message),
  );
});

test('valores inválidos se reportan todos juntos', () => {
  assert.throws(
    () =>
      load({
        PROTOCOL: 'ftp',
        PORT: 'abc',
        CAST_RECEIVER_APP_ID: 'x',
        MEDIA_ROOT: path.join(tmp, 'no-existe'),
      }),
    (e) => e instanceof ConfigError && e.problems.length === 4,
  );
});

test('CACHE_DIR dentro de MEDIA_ROOT no se permite', () => {
  assert.throws(
    () => load({ CACHE_DIR: path.join(media, 'cache') }),
    /CACHE_DIR no puede estar dentro/,
  );
});

test('sin IP de LAN cae a 127.0.0.1 con advertencia', () => {
  const c = load({}, noLan);
  assert.equal(c.publicBaseUrl, 'http://127.0.0.1:3000');
  assert.equal(c.warnings.length, 1);
});

test('PUBLIC_HOST=localhost avisa que el Chromecast no puede usarla', () => {
  const c = load({ PUBLIC_HOST: 'localhost' });
  assert.match(c.warnings[0], /Chromecast no la puede usar/);
});

test('detectLanIPv4 prefiere 192.168.x.x', () => {
  assert.equal(detectLanIPv4(lan()), '192.168.0.50');
  assert.equal(detectLanIPv4(noLan()), null);
});

test('HOST con IP concreta se usa como URL pública y avisa que localhost no responde', () => {
  const c = load({ HOST: '192.168.1.5', PORT: '30001' });
  assert.equal(c.publicBaseUrl, 'http://192.168.1.5:30001');
  assert.equal(c.publicHostSource, 'HOST');
  assert.match(c.warnings.join(' '), /localhost:30001 no responde/);
});

test('HOST=0.0.0.0 + PUBLIC_HOST: configuración recomendada, sin advertencias', () => {
  const c = load({ HOST: '0.0.0.0', PORT: '30001', PUBLIC_HOST: '192.168.1.5' });
  assert.equal(c.publicBaseUrl, 'http://192.168.1.5:30001');
  assert.deepEqual(c.warnings, []);
});

test('HOST=localhost avisa que el celular/Chromecast no pueden conectarse', () => {
  const c = load({ HOST: 'localhost', PUBLIC_HOST: '192.168.1.5' });
  assert.match(c.warnings.join(' '), /solo acepta conexiones de esta PC/);
});
