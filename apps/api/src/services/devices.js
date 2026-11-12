// Dispositivos que usan S-HUB (WU-19): cada app/navegador manda un heartbeat al abrir, cada 60 s
// y al cambiar el estado de reproducción. "Activo" = último heartbeat hace menos de N segundos.
import { HttpError } from '../lib/errors.js';

export const DEVICE_KINDS = ['android-tv', 'browser'];
export const DEFAULT_DEVICE_ACTIVE_SECONDS = 120;

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Texto corto y limpio (sin caracteres de control), o null. */
function text(v, max) {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean ? clean.slice(0, max) : null;
}

/** IP del cliente sin el prefijo IPv4-mapeado de IPv6 (::ffff:192.168.1.3 → 192.168.1.3). */
export const cleanIp = (ip) => (typeof ip === 'string' ? ip.replace(/^::ffff:/, '') : null);

export function createDevices({
  db,
  activeSeconds = DEFAULT_DEVICE_ACTIVE_SECONDS,
  now = () => Date.now(),
}) {
  const q = {
    upsert: db.prepare(`
      INSERT INTO devices
        (id, name, kind, model, app_version, ip, profile_id, first_seen, last_seen,
         np_item_id, np_position_sec, np_paused, np_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, kind = excluded.kind, model = excluded.model,
        app_version = excluded.app_version, ip = excluded.ip, profile_id = excluded.profile_id,
        last_seen = excluded.last_seen, np_item_id = excluded.np_item_id,
        np_position_sec = excluded.np_position_sec, np_paused = excluded.np_paused,
        np_updated_at = excluded.np_updated_at`),
    all: db.prepare(`
      SELECT d.*, p.name AS profile_name, p.color AS profile_color
      FROM devices d LEFT JOIN profiles p ON p.id = d.profile_id
      ORDER BY d.last_seen DESC`),
    get: db.prepare(`
      SELECT d.*, p.name AS profile_name, p.color AS profile_color
      FROM devices d LEFT JOIN profiles p ON p.id = d.profile_id WHERE d.id = ?`),
    remove: db.prepare('DELETE FROM devices WHERE id = ?'),
  };

  const isActive = (row) => now() - row.last_seen < activeSeconds * 1000;

  /** Fila → objeto del contrato. Lo que reproduce solo se informa si el dispositivo está activo. */
  function toDevice(row) {
    const active = isActive(row);
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      model: row.model,
      appVersion: row.app_version,
      ip: row.ip,
      profile: row.profile_id
        ? { id: row.profile_id, name: row.profile_name, color: row.profile_color }
        : null,
      firstSeen: new Date(row.first_seen).toISOString(),
      lastSeen: new Date(row.last_seen).toISOString(),
      active,
      nowPlaying:
        active && row.np_item_id
          ? {
              itemId: row.np_item_id,
              positionSec: row.np_position_sec,
              paused: row.np_paused === 1,
              updatedAt: new Date(row.np_updated_at).toISOString(),
            }
          : null,
    };
  }

  /** Valida el cuerpo del heartbeat (400 si algo no cierra). */
  function parseHeartbeat(body) {
    const b = body && typeof body === 'object' ? body : {};
    if (typeof b.deviceId !== 'string' || !DEVICE_ID_RE.test(b.deviceId)) {
      throw new HttpError(
        400,
        'INVALID_DEVICE',
        'deviceId inválido (8 a 64 caracteres [A-Za-z0-9_-])',
      );
    }
    const kind = b.kind ?? 'browser';
    if (!DEVICE_KINDS.includes(kind)) {
      throw new HttpError(400, 'INVALID_DEVICE', `kind debe ser ${DEVICE_KINDS.join(' o ')}`);
    }
    let nowPlaying = null;
    if (b.nowPlaying != null) {
      const np = b.nowPlaying;
      const position = np.positionSec;
      if (
        typeof np !== 'object' ||
        typeof np.itemId !== 'string' ||
        !np.itemId ||
        np.itemId.length > 2048 ||
        (position != null &&
          (typeof position !== 'number' || !Number.isFinite(position) || position < 0))
      ) {
        throw new HttpError(400, 'INVALID_DEVICE', 'nowPlaying inválido');
      }
      nowPlaying = { itemId: np.itemId, positionSec: position ?? 0, paused: np.paused === true };
    }
    const model = text(b.model, 60);
    return {
      id: b.deviceId,
      kind,
      model,
      name: text(b.name, 60) ?? model ?? (kind === 'android-tv' ? 'Android TV' : 'Navegador'),
      appVersion: text(b.appVersion, 30),
      nowPlaying,
    };
  }

  return {
    activeSeconds,

    /** Registra o actualiza un dispositivo. `profileId` sale del token (o null si no hay sesión). */
    heartbeat(body, { ip = null, profileId = null } = {}) {
      const d = parseHeartbeat(body);
      const t = now();
      const np = d.nowPlaying;
      q.upsert.run(
        d.id,
        d.name,
        d.kind,
        d.model,
        d.appVersion,
        cleanIp(ip),
        profileId,
        t,
        t,
        np?.itemId ?? null,
        np?.positionSec ?? null,
        np ? (np.paused ? 1 : 0) : null,
        np ? t : null,
      );
      return toDevice(q.get.get(d.id));
    },

    list({ activeOnly = false } = {}) {
      const all = q.all.all().map(toDevice);
      return activeOnly ? all.filter((d) => d.active) : all;
    },

    remove(id) {
      if (q.remove.run(id).changes === 0) {
        throw new HttpError(404, 'NOT_FOUND', 'Ese dispositivo no existe');
      }
    },
  };
}
