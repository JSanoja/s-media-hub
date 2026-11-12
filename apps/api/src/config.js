// Configuración de la API, 100 % por variables de entorno (ver ../CLAUDE.md → "Todo parametrizable").
// Cambiar de PC, de IP o pasar a HTTPS = cambiar el .env y reiniciar. Nada de red va hardcodeado.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProfilePins, DEFAULT_PROFILE_PINS } from './services/profiles.js';
import { DEFAULT_DEVICE_ACTIVE_SECONDS } from './services/devices.js';

/** Raíz del paquete apps/api. Las rutas relativas del .env se resuelven contra esta carpeta. */
export const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(fs.readFileSync(path.join(apiRoot, 'package.json'), 'utf8'));

/** App ID del Default Media Receiver de Google. */
export const DEFAULT_MEDIA_RECEIVER_APP_ID = 'CC1AD845';

export class ConfigError extends Error {
  constructor(problems) {
    super(`Configuración inválida:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

const isPrivateIPv4 = (ip) =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

/**
 * Primera IPv4 privada de la PC (prefiere 192.168.x.x, la típica de una LAN hogareña).
 * Devuelve null si no hay ninguna.
 */
export function detectLanIPv4(interfaces = os.networkInterfaces()) {
  const candidates = Object.values(interfaces)
    .flat()
    .filter((i) => i && (i.family === 'IPv4' || i.family === 4) && !i.internal)
    .map((i) => i.address)
    .filter(isPrivateIPv4);
  return candidates.find((ip) => ip.startsWith('192.168.')) ?? candidates[0] ?? null;
}

const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]']);
const isLoopback = (h) => h === 'localhost' || h === '::1' || h.startsWith('127.');

export function loadConfig(env = process.env, { networkInterfaces = os.networkInterfaces } = {}) {
  const problems = [];
  const warnings = [];
  const str = (name, fallback) => {
    const v = env[name];
    return v === undefined || v.trim() === '' ? fallback : v.trim();
  };
  const port = (name, fallback) => {
    const raw = str(name);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      problems.push(`${name} debe ser un entero entre 1 y 65535 (vino "${raw}")`);
      return fallback;
    }
    return n;
  };
  const dir = (name, fallback) => path.resolve(apiRoot, str(name, fallback));

  // --- Red ---
  const protocol = str('PROTOCOL', 'http').toLowerCase();
  if (!['http', 'https'].includes(protocol)) {
    problems.push(`PROTOCOL debe ser "http" o "https" (vino "${protocol}")`);
  }
  const host = str('HOST', '0.0.0.0');
  const listenPort = port('PORT', 3000);
  const publicPort = port('PUBLIC_PORT', listenPort);

  let tls = null;
  if (protocol === 'https') {
    const cert = str('TLS_CERT');
    const key = str('TLS_KEY');
    if (!cert || !key) problems.push('PROTOCOL=https requiere TLS_CERT y TLS_KEY');
    for (const [name, value] of [
      ['TLS_CERT', cert],
      ['TLS_KEY', key],
    ]) {
      if (value && !fs.existsSync(path.resolve(apiRoot, value))) {
        problems.push(`${name} no existe: ${path.resolve(apiRoot, value)}`);
      }
    }
    if (cert && key) tls = { cert: path.resolve(apiRoot, cert), key: path.resolve(apiRoot, key) };
  }

  // URL pública con la que el front y el Chromecast llegan a la API.
  let publicBaseUrl;
  let publicHostSource;
  const override = str('PUBLIC_BASE_URL');
  if (override) {
    try {
      const u = new URL(override);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocolo');
      publicBaseUrl = u.origin + u.pathname.replace(/\/+$/, '');
      publicHostSource = 'PUBLIC_BASE_URL';
    } catch {
      problems.push(`PUBLIC_BASE_URL no es una URL http(s) válida (vino "${override}")`);
    }
  } else {
    let publicHost = str('PUBLIC_HOST');
    publicHostSource = 'PUBLIC_HOST';
    if (!publicHost && !WILDCARD_HOSTS.has(host) && !isLoopback(host)) {
      // HOST es una IP concreta de la LAN: es la que ven el front y el Chromecast.
      publicHost = host;
      publicHostSource = 'HOST';
    }
    if (!publicHost) {
      publicHost = detectLanIPv4(networkInterfaces());
      publicHostSource = 'autodetectado';
      if (!publicHost) {
        publicHost = '127.0.0.1';
        publicHostSource = 'fallback';
        warnings.push(
          'No se encontró una IPv4 de la red local: se usa 127.0.0.1 y el Chromecast NO va a poder conectarse. Configurá PUBLIC_HOST.',
        );
      }
    }
    const defaultPort = protocol === 'https' ? 443 : 80;
    const portPart = publicPort === defaultPort ? '' : `:${publicPort}`;
    const hostPart = publicHost.includes(':') ? `[${publicHost}]` : publicHost; // IPv6
    publicBaseUrl = `${protocol}://${hostPart}${portPart}`;
  }
  if (
    publicBaseUrl &&
    /\/\/(localhost|127\.)/.test(publicBaseUrl) &&
    publicHostSource !== 'fallback'
  ) {
    warnings.push(
      `La URL pública ${publicBaseUrl} apunta a esta PC: el Chromecast no la puede usar. Usá la IP de la LAN.`,
    );
  }

  if (isLoopback(host)) {
    warnings.push(
      `HOST=${host}: la API solo acepta conexiones de esta PC; el celular y el Chromecast NO van a poder conectarse. Usá HOST=0.0.0.0.`,
    );
  }
  if (!WILDCARD_HOSTS.has(host) && !isLoopback(host)) {
    warnings.push(
      `HOST=${host}: la API solo escucha en esa IP, así que http://localhost:${listenPort} no responde (el botón de Cast en esta PC lo necesita mientras no haya HTTPS). Recomendado: HOST=0.0.0.0 y PUBLIC_HOST=${host}.`,
    );
  }

  // --- Biblioteca y cache ---
  const mediaRoot = dir('MEDIA_ROOT', 'public/source');
  try {
    if (!fs.statSync(mediaRoot).isDirectory())
      problems.push(`MEDIA_ROOT no es una carpeta: ${mediaRoot}`);
  } catch {
    problems.push(`MEDIA_ROOT no existe: ${mediaRoot}`);
  }
  const cacheDir = dir('CACHE_DIR', '../../cache');
  const rel = path.relative(mediaRoot, cacheDir);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    problems.push(
      'CACHE_DIR no puede estar dentro de MEDIA_ROOT (la biblioteca es de solo lectura)',
    );
  }

  // --- Cast / CORS / varios ---
  const castReceiverAppId = str('CAST_RECEIVER_APP_ID', DEFAULT_MEDIA_RECEIVER_APP_ID);
  if (!/^[A-Z0-9]{8}$/i.test(castReceiverAppId)) {
    problems.push(
      `CAST_RECEIVER_APP_ID debe tener 8 caracteres alfanuméricos (vino "${castReceiverAppId}")`,
    );
  }
  const corsOrigins = str('CORS_ORIGINS', '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let profilePins = DEFAULT_PROFILE_PINS;
  if (str('PROFILE_PINS')) {
    try {
      profilePins = { ...DEFAULT_PROFILE_PINS, ...parseProfilePins(str('PROFILE_PINS')) };
    } catch (err) {
      problems.push(`PROFILE_PINS: ${err.message}`);
    }
  }

  // --- Dispositivos (WU-19) ---
  let deviceActiveSeconds = DEFAULT_DEVICE_ACTIVE_SECONDS;
  if (str('DEVICE_ACTIVE_SECONDS')) {
    const n = Number(str('DEVICE_ACTIVE_SECONDS'));
    if (!Number.isInteger(n) || n < 10 || n > 86400) {
      problems.push(
        `DEVICE_ACTIVE_SECONDS debe ser un entero entre 10 y 86400 (vino "${str('DEVICE_ACTIVE_SECONDS')}")`,
      );
    } else deviceActiveSeconds = n;
  }

  if (problems.length) throw new ConfigError(problems);

  return Object.freeze({
    version: pkg.version,
    protocol,
    host,
    port: listenPort,
    publicPort,
    publicBaseUrl,
    publicHostSource,
    tls,
    mediaRoot,
    cacheDir,
    thumbsDir: path.join(cacheDir, 'thumbs'),
    dbPath: path.join(cacheDir, 'shub.db'),
    profilePins,
    deviceActiveSeconds,
    // Build de la interfaz para TV (apps/tv). Se sirve en /tv/.
    tvDir: dir('TV_DIR', '../tv/dist'),
    castReceiverAppId,
    corsOrigins,
    ffmpegPath: str('FFMPEG_PATH'),
    ffprobePath: str('FFPROBE_PATH'),
    logFormat: str('LOG_FORMAT', 'dev'),
    warnings,
  });
}
