// Resolución segura de rutas de usuario contra MEDIA_ROOT (WU-04).
// TODA ruta que venga de un request pasa por acá antes de tocar el disco o ffmpeg.
import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { HttpError } from './errors.js';

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mkv', '.webm', '.mov']);
export const SUBTITLE_EXTENSIONS = new Set(['.vtt', '.srt']);
export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
/** Lo único que se sirve de la biblioteca. */
export const SERVABLE_EXTENSIONS = new Set([
  ...VIDEO_EXTENSIONS,
  ...SUBTITLE_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
]);

const invalid = (msg) => new HttpError(400, 'INVALID_PATH', msg);
const notFound = () => new HttpError(404, 'NOT_FOUND', 'No existe');

/**
 * Normaliza una ruta relativa de usuario ("/serie/temporada", "serie\\cap1.mp4") a segmentos
 * seguros. Rechaza: no-strings, bytes nulos, "..", rutas absolutas de Windows (C:\, \\server),
 * y segmentos que empiezan con "." (archivos ocultos).
 */
export function toSafeSegments(rel) {
  if (rel === undefined || rel === null) return [];
  if (typeof rel !== 'string') throw invalid('La ruta debe ser texto');
  if (rel.includes('\0')) throw invalid('Ruta inválida');
  if (/^[a-zA-Z]:/.test(rel) || /^[\\/]{2}/.test(rel))
    throw invalid('No se permiten rutas absolutas');
  const segments = rel.split(/[\\/]+/).filter((s) => s !== '' && s !== '.');
  for (const s of segments) {
    if (s === '..') throw invalid('No se permite ".." en la ruta');
    if (s.startsWith('.')) throw invalid('No se permiten archivos ocultos');
    if (/[<>:"|?*]/.test(s)) throw invalid('Caracteres no permitidos en la ruta');
  }
  return segments;
}

/** true si `target` está dentro de `root` (o es `root`). */
export function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resuelve `rel` dentro de `root` y verifica que exista y que (siguiendo symlinks) no se salga.
 * @param {object} [opts]
 * @param {'file'|'dir'} [opts.type] tipo esperado
 * @param {Set<string>} [opts.extensions] extensiones permitidas (solo archivos)
 * @returns {Promise<string>} ruta absoluta real
 */
export async function resolveInside(root, rel, { type, extensions } = {}) {
  const target = path.join(root, ...toSafeSegments(rel));
  if (!isInside(root, target)) throw invalid('Ruta fuera de la biblioteca');

  let real;
  let info;
  try {
    real = await realpath(target);
    info = await stat(real);
  } catch {
    throw notFound();
  }
  // Un symlink dentro de la biblioteca no puede apuntar afuera.
  if (!isInside(await realpath(root), real)) throw notFound();

  if (type === 'dir' && !info.isDirectory()) throw invalid('La ruta no es una carpeta');
  if (type === 'file' && !info.isFile()) throw invalid('La ruta no es un archivo');
  if (extensions && info.isFile() && !extensions.has(path.extname(real).toLowerCase())) {
    throw new HttpError(415, 'UNSUPPORTED_TYPE', 'Tipo de archivo no permitido');
  }
  return real;
}
