// Perfiles con PIN (WU-21): Obi, Papas, Invitados.
import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { requireProfile, clientKey, PROFILE_HEADER } from '../lib/auth.js';

const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

export function createProfilesRouter({ profiles }) {
  const router = Router();

  router.get('/', (_req, res) => res.json(profiles.list()));

  // Perfil de la sesión actual (para validar el token guardado al abrir la app).
  router.get('/me', requireProfile(profiles), (req, res) => res.json(req.profile));

  router.post('/:id/session', (req, res) => {
    const { pin, deviceId } = body(req);
    const result = profiles.login(req.params.id, pin, {
      deviceId: typeof deviceId === 'string' ? deviceId.slice(0, 64) : null,
      clientKey: clientKey(req, deviceId),
    });
    res.status(201).json(result);
  });

  router.delete('/session', (req, res) => {
    profiles.logout(req.get(PROFILE_HEADER));
    res.status(204).end();
  });

  router.put('/:id/pin', (req, res) => {
    const { currentPin, newPin, deviceId } = body(req);
    if (currentPin === newPin) {
      throw new HttpError(400, 'SAME_PIN', 'El PIN nuevo tiene que ser distinto del actual');
    }
    profiles.changePin(req.params.id, currentPin, newPin, { clientKey: clientKey(req, deviceId) });
    res.status(204).end();
  });

  return router;
}
