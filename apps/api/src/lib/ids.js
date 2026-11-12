// IDs opacos para la API v1: base64url de la ruta relativa a MEDIA_ROOT (segmentos unidos con "/").
// Son estables (misma ruta = mismo id) y no exponen separadores de Windows/Unix.
import { HttpError } from './errors.js';
import { toSafeSegments } from './safePath.js';

export const ROOT_ID = 'root';

export function encodeId(segments) {
  if (segments.length === 0) return ROOT_ID;
  return Buffer.from(segments.join('/'), 'utf8').toString('base64url');
}

/** Decodifica y valida un id → segmentos seguros. Lanza 400 si es inválido. */
export function decodeId(id) {
  if (id === ROOT_ID || id === undefined || id === '') return [];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new HttpError(400, 'INVALID_ID', 'Id inválido');
  }
  const rel = Buffer.from(id, 'base64url').toString('utf8');
  // Forma canónica: rechaza ids "equivalentes" y bytes que no son UTF-8 válido.
  if (Buffer.from(rel, 'utf8').toString('base64url') !== id) {
    throw new HttpError(400, 'INVALID_ID', 'Id inválido');
  }
  return toSafeSegments(rel);
}
