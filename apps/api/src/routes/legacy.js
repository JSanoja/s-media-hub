// Endpoints legacy que usa el front Angular viejo. Se mantienen con el MISMO contrato
// hasta WU-15; la API nueva (/api/v1) se construye en WU-05.
// Desde WU-04 toda ruta pasa por resolveInside (sin path traversal).
import { Router } from 'express';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolveInside } from '../lib/safePath.js';
import { rateLimit } from '../lib/rateLimit.js';

export function createLegacyRouter({ mediaRoot, thumbs }) {
  const router = Router();

  // GET /api/browse?path=/serie/temporada → { path, folders, videos, cover }
  router.get('/browse', async (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path : '';
    const dir = await resolveInside(mediaRoot, rel, { type: 'dir' });
    const entries = (await readdir(dir, { withFileTypes: true })).filter(
      (d) => !d.name.startsWith('.'),
    );

    const folders = entries.filter((d) => d.isDirectory()).map((d) => d.name);
    const videos = entries
      .filter((d) => d.isFile() && d.name.includes('mp4') && !d.name.includes('mp4.jpg'))
      .map((d) => d.name);
    const cover = entries
      .filter((d) => d.isFile() && d.name.includes('cover'))
      .map((d) => d.name)[0];

    // Comportamiento original: genera miniaturas faltantes en segundo plano (WU-06 lo rediseña).
    if (videos.length > 1) {
      for (const video of videos) {
        const videoRel = `${rel}/${video}`;
        if (!existsSync(thumbs.thumbPathFor(videoRel))) {
          thumbs
            .generate(videoRel)
            .catch((err) => console.error(`[thumbs] ${video}: ${err.message}`));
        }
      }
    }

    res.json({ path: rel, folders, videos, cover: `/source${rel}/${cover}` });
  });

  // GET /api/thumb?path=/serie/temporada/cap1.mp4 → genera la miniatura en el cache
  router.get('/thumb', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
    await thumbs.generate(req.query.path); // valida la ruta; errores → errorHandler
    res.send('sucess'); // (sic) respuesta original
  });

  return router;
}
