// Perfiles con PIN (WU-21). El PIN es un candado de comodidad para la casa (la API corre por HTTP
// en la LAN), pero igual se guarda hasheado (scrypt + sal) y con límite de intentos.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { HttpError } from '../lib/errors.js';
import { transaction } from './db.js';

export const DEFAULT_PROFILES = [
  { id: 'obi', name: 'Obi', color: '#ff5a36', sort: 1 },
  { id: 'papas', name: 'Papas', color: '#3fb27f', sort: 2 },
  { id: 'invitados', name: 'Invitados', color: '#7a8ca8', sort: 3 },
];

/** PINs por defecto (WU-21). Se pueden cambiar desde la app o sembrar otros con PROFILE_PINS. */
export const DEFAULT_PROFILE_PINS = { obi: '7890', papas: '5555', invitados: '1111' };

const PIN_RE = /^\d{4}$/;
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

const hashPin = (pin, salt) => scryptSync(pin, salt, 32).toString('hex');
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function assertPinFormat(pin, field = 'pin') {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) {
    throw new HttpError(400, 'INVALID_PIN_FORMAT', `El ${field} debe tener 4 dígitos`);
  }
}

export function createProfiles({ db, seedPins = {}, now = () => Date.now() }) {
  // Siembra: crea los perfiles que falten con su PIN por defecto. Nunca pisa un PIN ya cambiado.
  const insert = db.prepare(
    `INSERT INTO profiles (id, name, color, sort, pin_hash, pin_salt)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
  );
  for (const p of DEFAULT_PROFILES) {
    const pin = seedPins[p.id];
    if (!pin) continue;
    const salt = randomBytes(16).toString('hex');
    insert.run(p.id, p.name, p.color, p.sort, hashPin(pin, salt), salt);
  }

  const q = {
    list: db.prepare('SELECT id, name, color FROM profiles ORDER BY sort, name'),
    get: db.prepare('SELECT * FROM profiles WHERE id = ?'),
    attempts: db.prepare('SELECT * FROM pin_attempts WHERE profile_id = ? AND client_key = ?'),
    fail: db.prepare(
      `INSERT INTO pin_attempts (profile_id, client_key, failures, locked_until) VALUES (?, ?, 1, 0)
       ON CONFLICT(profile_id, client_key) DO UPDATE SET failures = failures + 1`,
    ),
    lock: db.prepare(
      'UPDATE pin_attempts SET failures = 0, locked_until = ? WHERE profile_id = ? AND client_key = ?',
    ),
    clearAttempts: db.prepare('DELETE FROM pin_attempts WHERE profile_id = ? AND client_key = ?'),
    insertSession: db.prepare(
      'INSERT INTO profile_sessions (token_hash, profile_id, device_id) VALUES (?, ?, ?)',
    ),
    session: db.prepare(
      `SELECT p.id, p.name, p.color, s.device_id FROM profile_sessions s
       JOIN profiles p ON p.id = s.profile_id WHERE s.token_hash = ?`,
    ),
    touchSession: db.prepare(
      "UPDATE profile_sessions SET last_used_at = datetime('now') WHERE token_hash = ?",
    ),
    deleteSession: db.prepare('DELETE FROM profile_sessions WHERE token_hash = ?'),
    deleteProfileSessions: db.prepare('DELETE FROM profile_sessions WHERE profile_id = ?'),
    setPin: db.prepare('UPDATE profiles SET pin_hash = ?, pin_salt = ? WHERE id = ?'),
  };

  const publicProfile = ({ id, name, color }) => ({ id, name, color });

  function getProfileRow(id) {
    const row = q.get.get(id);
    if (!row) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Ese perfil no existe');
    return row;
  }

  /** Verifica el PIN con límite de intentos por (perfil, dispositivo/IP). */
  function verifyPin(profile, pin, clientKey) {
    assertPinFormat(pin);
    const attempts = q.attempts.get(profile.id, clientKey);
    if (attempts && attempts.locked_until > now()) {
      const retryAfter = Math.ceil((attempts.locked_until - now()) / 1000);
      const err = new HttpError(
        429,
        'PIN_LOCKED',
        `Demasiados intentos. Probá de nuevo en ${retryAfter} s`,
      );
      err.details = { retryAfter };
      throw err;
    }
    const expected = Buffer.from(profile.pin_hash, 'hex');
    const actual = Buffer.from(hashPin(pin, profile.pin_salt), 'hex');
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      q.clearAttempts.run(profile.id, clientKey);
      return;
    }
    q.fail.run(profile.id, clientKey);
    const failures = q.attempts.get(profile.id, clientKey).failures;
    if (failures >= MAX_FAILURES) {
      q.lock.run(now() + LOCK_MS, profile.id, clientKey);
      const err = new HttpError(429, 'PIN_LOCKED', 'Demasiados intentos. Probá de nuevo en 60 s');
      err.details = { retryAfter: LOCK_MS / 1000 };
      throw err;
    }
    const err = new HttpError(401, 'INVALID_PIN', 'PIN incorrecto');
    err.details = { attemptsLeft: MAX_FAILURES - failures };
    throw err;
  }

  return {
    list: () => q.list.all().map(publicProfile),

    /** Abre sesión con PIN → token (solo se guarda su hash). */
    login(profileId, pin, { deviceId = null, clientKey }) {
      const profile = getProfileRow(profileId);
      verifyPin(profile, pin, clientKey);
      const token = randomBytes(32).toString('base64url');
      q.insertSession.run(hashToken(token), profile.id, deviceId);
      return { token, profile: publicProfile(profile) };
    },

    /** Perfil de un token, o null. */
    fromToken(token) {
      if (typeof token !== 'string' || token.length < 20) return null;
      const h = hashToken(token);
      const row = q.session.get(h);
      if (!row) return null;
      q.touchSession.run(h);
      return { profile: publicProfile(row), deviceId: row.device_id };
    },

    logout(token) {
      if (typeof token === 'string') q.deleteSession.run(hashToken(token));
    },

    /** Cambia el PIN (requiere el actual) y cierra todas las sesiones de ese perfil. */
    changePin(profileId, currentPin, newPin, { clientKey }) {
      const profile = getProfileRow(profileId);
      verifyPin(profile, currentPin, clientKey);
      assertPinFormat(newPin, 'PIN nuevo');
      const salt = randomBytes(16).toString('hex');
      transaction(db, () => {
        q.setPin.run(hashPin(newPin, salt), salt, profile.id);
        q.deleteProfileSessions.run(profile.id);
      });
    },
  };
}

/** Parsea PROFILE_PINS="obi:7890,papas:5555,invitados:1111". */
export function parseProfilePins(raw) {
  const pins = {};
  for (const part of String(raw ?? '').split(',')) {
    const [id, pin] = part.split(':').map((s) => s?.trim());
    if (!id) continue;
    if (!PIN_RE.test(pin ?? '')) throw new Error(`PIN inválido para "${id}" (4 dígitos)`);
    pins[id.toLowerCase()] = pin;
  }
  return pins;
}
