// Historial por perfil (WU-09): posición para "Seguir viendo" y marca de visto (✓).
// Lo visto NO se oculta en ningún listado: solo se marca (decisión de Juan 2026-10-22).

/** Umbral para considerar un video terminado. */
export const WATCHED_RATIO = 0.9;
/** Posición mínima para que aparezca en "Seguir viendo". */
export const RESUME_MIN_SEC = 30;

export function createHistory({ db, now = () => Date.now() }) {
  const q = {
    get: db.prepare('SELECT * FROM watch_state WHERE profile_id = ? AND item_id = ?'),
    upsert: db.prepare(`
      INSERT INTO watch_state
        (profile_id, item_id, position_sec, duration_sec, watched, watched_at, device_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, item_id) DO UPDATE SET
        position_sec = excluded.position_sec,
        duration_sec = excluded.duration_sec,
        watched = excluded.watched,
        watched_at = excluded.watched_at,
        device_id = excluded.device_id,
        updated_at = excluded.updated_at`),
    continueWatching: db.prepare(`
      SELECT * FROM watch_state
      WHERE profile_id = ? AND position_sec >= ?
      ORDER BY updated_at DESC LIMIT ?`),
  };

  /** Fila de la base → objeto `progress` del contrato. */
  const toProgress = (row) =>
    row
      ? {
          positionSec: row.position_sec,
          durationSec: row.duration_sec,
          watched: row.watched === 1,
          updatedAt: new Date(row.updated_at).toISOString(),
        }
      : null;

  function save(profileId, itemId, row) {
    q.upsert.run(
      profileId,
      itemId,
      row.position_sec,
      row.duration_sec ?? null,
      row.watched ? 1 : 0,
      row.watched_at ?? null,
      row.device_id ?? null,
      now(),
    );
    return toProgress(q.get.get(profileId, itemId));
  }

  return {
    toProgress,

    get: (profileId, itemId) => toProgress(q.get.get(profileId, itemId)),

    /** Progreso de varios items de una vez → Map(itemId → progress). */
    getMany(profileId, itemIds) {
      const map = new Map();
      if (!profileId || itemIds.length === 0) return map;
      // Por tandas: SQLite limita la cantidad de parámetros.
      for (let i = 0; i < itemIds.length; i += 500) {
        const chunk = itemIds.slice(i, i + 500);
        const rows = db
          .prepare(
            `SELECT * FROM watch_state WHERE profile_id = ? AND item_id IN (${chunk.map(() => '?').join(',')})`,
          )
          .all(profileId, ...chunk);
        for (const r of rows) map.set(r.item_id, toProgress(r));
      }
      return map;
    },

    /**
     * Reporte del reproductor. Al pasar el 90 % (o al terminar) queda visto ✓ y la posición vuelve
     * a 0 (la próxima vez arranca de nuevo). El ✓ no se borra solo: únicamente con setWatched(false).
     */
    report(profileId, itemId, { positionSec, durationSec, deviceId, ended = false }) {
      const prev = q.get.get(profileId, itemId);
      const duration = durationSec > 0 ? durationSec : (prev?.duration_sec ?? null);
      const position = Math.max(0, positionSec || 0);
      const finished = ended || (duration ? position / duration >= WATCHED_RATIO : false);
      return save(profileId, itemId, {
        position_sec: finished ? 0 : position,
        duration_sec: duration,
        watched: finished || prev?.watched === 1,
        watched_at: finished ? now() : (prev?.watched_at ?? null),
        device_id: deviceId ?? prev?.device_id,
      });
    },

    /** Marcar / desmarcar visto a mano. Desmarcar no toca la posición. */
    setWatched(profileId, itemId, watched) {
      const prev = q.get.get(profileId, itemId);
      return save(profileId, itemId, {
        position_sec: watched ? 0 : (prev?.position_sec ?? 0),
        duration_sec: prev?.duration_sec,
        watched,
        watched_at: watched ? now() : null,
        device_id: prev?.device_id,
      });
    },

    /** Items a medias del perfil, del más reciente al más viejo. */
    continueWatching(profileId, limit = 20) {
      return q.continueWatching.all(profileId, RESUME_MIN_SEC, limit);
    },
  };
}
