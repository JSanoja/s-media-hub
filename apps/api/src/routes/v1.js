// API v1 para el front nuevo (WU-05) + historial por perfil (WU-09).
import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { requireProfile, optionalProfile } from '../lib/auth.js';
import { VIDEO_EXTENSIONS } from '../lib/safePath.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function createV1Router({ config, library, profiles, history }) {
  const router = Router();
  const withProfile = optionalProfile(profiles);
  const needProfile = requireProfile(profiles);

  /** Agrega `progress` (y `watchedCount` en carpetas) según el perfil activo. */
  function decorateItems(items, profileId) {
    const map = history.getMany(
      profileId,
      items.map((i) => i.id),
    );
    for (const item of items) item.progress = map.get(item.id) ?? null;
    return items;
  }

  function decorateFolder(folder, profileId) {
    decorateItems(folder.items, profileId);
    if (!profileId) return folder;
    for (const f of folder.folders) {
      const ids = f.videoIds ?? [];
      const map = history.getMany(profileId, ids);
      f.watchedCount = ids.filter((id) => map.get(id)?.watched).length;
    }
    return folder;
  }

  // Config pública: así el front no lleva URLs compiladas (ver ../CLAUDE.md).
  router.get('/config', (_req, res) =>
    res.json({
      publicBaseUrl: config.publicBaseUrl,
      castReceiverAppId: config.castReceiverAppId,
      version: config.version,
    }),
  );

  // Carpeta: raíz si no hay ?path, o el id de una carpeta.
  router.get('/library', withProfile, async (req, res) => {
    const id = typeof req.query.path === 'string' ? req.query.path : undefined;
    res.json(decorateFolder(await library.getFolder(id), req.profile?.id));
  });

  router.get('/items/:id', withProfile, async (req, res) => {
    const [item] = decorateItems([await library.getItem(req.params.id)], req.profile?.id);
    res.json(item);
  });

  router.get('/items/:id/next', withProfile, async (req, res) => {
    const next = await library.getNext(req.params.id);
    res.json({ next: next ? decorateItems([next], req.profile?.id)[0] : null });
  });

  // ---- Historial (requiere perfil) ----

  router.get('/continue-watching', needProfile, async (req, res) => {
    const rows = history.continueWatching(req.profile.id, 20);
    const items = [];
    for (const row of rows) {
      try {
        const item = await library.getItem(row.item_id);
        item.progress = history.toProgress(row);
        items.push(item);
      } catch {
        // El archivo ya no existe (se movió o borró): no se muestra.
      }
    }
    res.json(items);
  });

  router.put('/items/:id/progress', needProfile, async (req, res) => {
    await library.getFilePath(req.params.id, VIDEO_EXTENSIONS); // valida que el video exista
    const body = req.body ?? {};
    const positionSec = num(body.positionSec);
    if (positionSec === undefined || positionSec < 0) {
      throw new HttpError(400, 'INVALID_PROGRESS', 'positionSec debe ser un número ≥ 0');
    }
    res.json(
      history.report(req.profile.id, req.params.id, {
        positionSec,
        durationSec: num(body.durationSec),
        deviceId: typeof body.deviceId === 'string' ? body.deviceId.slice(0, 64) : undefined,
        ended: body.ended === true,
      }),
    );
  });

  router.post('/items/:id/watched', needProfile, async (req, res) => {
    await library.getFilePath(req.params.id, VIDEO_EXTENSIONS);
    res.json(history.setWatched(req.profile.id, req.params.id, true));
  });

  router.delete('/items/:id/watched', needProfile, async (req, res) => {
    await library.getFilePath(req.params.id, VIDEO_EXTENSIONS);
    res.json(history.setWatched(req.profile.id, req.params.id, false));
  });

  return router;
}
