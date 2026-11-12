// Base de datos embebida (node:sqlite): un solo archivo en CACHE_DIR/shub.db, sin servidor.
// Las migraciones son una lista ordenada; se aplican al abrir y se registra la versión.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  // 1 · Perfiles con PIN (WU-21)
  `
  CREATE TABLE profiles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    sort        INTEGER NOT NULL DEFAULT 0,
    pin_hash    TEXT NOT NULL,
    pin_salt    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE profile_sessions (
    token_hash    TEXT PRIMARY KEY,
    profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_id     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX profile_sessions_profile ON profile_sessions(profile_id);
  CREATE TABLE pin_attempts (
    profile_id    TEXT NOT NULL,
    client_key    TEXT NOT NULL,
    failures      INTEGER NOT NULL DEFAULT 0,
    locked_until  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, client_key)
  );
  `,
  // 2 · Historial por perfil: "Seguir viendo" y vistos (WU-09)
  `
  CREATE TABLE watch_state (
    profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    item_id       TEXT NOT NULL,
    position_sec  REAL NOT NULL DEFAULT 0,
    duration_sec  REAL,
    watched       INTEGER NOT NULL DEFAULT 0,
    watched_at    INTEGER,
    device_id     TEXT,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (profile_id, item_id)
  );
  CREATE INDEX watch_state_recent ON watch_state(profile_id, updated_at DESC);
  `,
  // 3 · Dispositivos que usan S-HUB y qué están viendo (WU-19)
  `
  CREATE TABLE devices (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    kind               TEXT NOT NULL,
    model              TEXT,
    app_version        TEXT,
    ip                 TEXT,
    profile_id         TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    first_seen         INTEGER NOT NULL,
    last_seen          INTEGER NOT NULL,
    np_item_id         TEXT,
    np_position_sec    REAL,
    np_paused          INTEGER,
    np_updated_at      INTEGER
  );
  CREATE INDEX devices_last_seen ON devices(last_seen DESC);
  `,
  // 4 · Subtítulos: idioma detectado (cache) y ajuste de sincronización por video (WU-18)
  `
  CREATE TABLE subtitle_lang (
    path        TEXT PRIMARY KEY,
    mtime_ms    INTEGER NOT NULL,
    size        INTEGER NOT NULL,
    lang        TEXT,
    confidence  REAL
  );
  CREATE TABLE subtitle_offsets (
    item_id     TEXT NOT NULL,
    sub_id      TEXT NOT NULL,
    offset_ms   INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (item_id, sub_id)
  );
  `,
];

/** Abre (o crea) la base y aplica migraciones pendientes. `file` puede ser ':memory:'. */
/** Renombre js-flix → S-HUB: si existe la base vieja (jsflix.db) y no la nueva, se renombra (con WAL/SHM). */
function migrateLegacyFile(file) {
  const legacy = path.join(path.dirname(file), 'jsflix.db');
  if (legacy === file || fs.existsSync(file) || !fs.existsSync(legacy)) return;
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(legacy + suffix)) fs.renameSync(legacy + suffix, file + suffix);
  }
}

export function openDb(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    migrateLegacyFile(file);
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Falló la migración ${v + 1} de la base: ${err.message}`, { cause: err });
    }
  }
  return db;
}

/** Ejecuta `fn` dentro de una transacción. */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
