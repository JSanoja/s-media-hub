// Archivos binarios para el Chromecast y el front: video (Range), miniaturas, covers y subtítulos.
import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS } from '../lib/safePath.js';
import { decodeSubtitle, srtToVtt, shiftVtt } from '../lib/subtitles.js';
import { parseOffset } from '../services/subtitles.js';
import { rateLimit } from '../lib/rateLimit.js';

const CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
};

export function createMediaRouter({ library, thumbs }) {
  const router = Router();
  const send = (res, file, opts = {}) =>
    new Promise((resolve, reject) =>
      res.sendFile(file, { dotfiles: 'allow', ...opts }, (err) =>
        err && !res.headersSent ? reject(err) : resolve(),
      ),
    );

  router.get('/folders/:id/cover', async (req, res) => {
    await send(res, await library.getCoverPath(req.params.id), { maxAge: '1h' });
  });

  // Miniatura on-demand: se genera la primera vez y queda en el cache.
  router.get('/:id/thumb.jpg', rateLimit({ windowMs: 60_000, max: 120 }), async (req, res) => {
    const rel = library.toRel(library.decodeId(req.params.id));
    const cached = thumbs.thumbPathFor(rel);
    const file = existsSync(cached) ? cached : await thumbs.generate(rel);
    await send(res, file, { maxAge: '1d' });
  });

  // ?offsetMs=-1500 desplaza los tiempos (WU-18): positivo = más tarde, negativo = antes.
  router.get('/:id/subtitles.vtt', async (req, res) => {
    const offsetMs = parseOffset(req.query.offsetMs);
    const file = await library.getFilePath(req.params.id, SUBTITLE_EXTENSIONS);
    const text = decodeSubtitle(await readFile(file));
    const vtt = path.extname(file).toLowerCase() === '.srt' ? srtToVtt(text) : text;
    res.type('text/vtt; charset=utf-8').send(shiftVtt(vtt, offsetMs));
  });

  // Stream del video con HTTP Range (206) — lo que usa el Chromecast para reproducir y adelantar.
  router.get('/:id', async (req, res) => {
    const file = await library.getFilePath(req.params.id, VIDEO_EXTENSIONS);
    await send(res, file, {
      headers: { 'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] },
    });
  });

  return router;
}
