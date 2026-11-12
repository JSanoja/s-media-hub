// /tv sirve el build real de apps/tv (si está compilado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { apiRoot } from '../src/config.js';

const tvDir = path.resolve(apiRoot, '../tv/dist');

test(
  '/tv/ sirve index.html del build de apps/tv',
  { skip: !existsSync(tvDir) && 'apps/tv sin compilar' },
  async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'shub-tv-'));
    const app = createApp({
      publicDir: tmp,
      tvDir,
      mediaRoot: tmp,
      cacheDir: path.join(tmp, 'c'),
      thumbsDir: path.join(tmp, 'c', 't'),
      publicBaseUrl: 'http://192.168.0.50:3000',
      castReceiverAppId: 'CC1AD845',
      version: 'test',
      logFormat: 'off',
    });
    const server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const redirect = await fetch(`${base}/tv`, { redirect: 'manual' });
      assert.equal(redirect.status, 301);
      const res = await fetch(`${base}/tv/`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /<div id="app">/);
    } finally {
      server.close();
    }
  },
);
