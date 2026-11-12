// Perfil activo a partir del header X-Profile-Token (WU-21).
import { HttpError } from './errors.js';

export const PROFILE_HEADER = 'x-profile-token';

/** Middleware: exige un perfil con sesión válida → req.profile, req.profileToken. */
export function requireProfile(profiles) {
  return (req, _res, next) => {
    const token = req.get(PROFILE_HEADER);
    const session = token ? profiles.fromToken(token) : null;
    if (!session) {
      return next(new HttpError(401, 'PROFILE_REQUIRED', 'Elegí un perfil e ingresá el PIN'));
    }
    req.profile = session.profile;
    req.profileToken = token;
    next();
  };
}

/** Clave para el límite de intentos de PIN: el dispositivo si lo informa, si no la IP. */
export const clientKey = (req, deviceId) =>
  typeof deviceId === 'string' && deviceId.length >= 8 && deviceId.length <= 64
    ? `device:${deviceId}`
    : `ip:${req.ip}`;

/** Middleware: si hay un token válido, req.profile; si no, sigue sin perfil (no falla). */
export function optionalProfile(profiles) {
  return (req, _res, next) => {
    const token = req.get(PROFILE_HEADER);
    const session = token ? profiles.fromToken(token) : null;
    if (session) {
      req.profile = session.profile;
      req.profileToken = token;
    }
    next();
  };
}
