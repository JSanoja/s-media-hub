// Dispositivos activos (WU-19).
import { Router } from 'express';
import { optionalProfile } from '../lib/auth.js';

export function createDevicesRouter({ devices, profiles, library }) {
  const router = Router();

  /** Título legible de lo que se está reproduciendo (si el video sigue existiendo). */
  async function withTitles(list) {
    await Promise.all(
      list.map(async (d) => {
        if (!d.nowPlaying) return;
        const item = await library.getItem(d.nowPlaying.itemId).catch(() => null);
        d.nowPlaying.title = item?.title ?? null;
        d.nowPlaying.type = item?.type ?? null;
        d.nowPlaying.series = item?.series ?? null;
        d.nowPlaying.season = item?.season ?? null;
        d.nowPlaying.episode = item?.episode ?? null;
        d.nowPlaying.durationSec = item?.durationSec ?? null;
      }),
    );
    return list;
  }

  // POST /api/v1/devices/heartbeat · el perfil (si hay) sale del header X-Profile-Token.
  router.post('/heartbeat', optionalProfile(profiles), async (req, res) => {
    const device = devices.heartbeat(req.body, {
      ip: req.ip,
      profileId: req.profile?.id ?? null,
    });
    res.json((await withTitles([device]))[0]);
  });

  // GET /api/v1/devices · ?active=1 → solo los activos.
  router.get('/', async (req, res) => {
    const activeOnly = ['1', 'true'].includes(String(req.query.active ?? '').toLowerCase());
    res.json(await withTitles(devices.list({ activeOnly })));
  });

  router.delete('/:id', (req, res) => {
    devices.remove(req.params.id);
    res.status(204).end();
  });

  return router;
}
