import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import { createFfmpeg } from './services/ffmpeg.js';
import { createThumbs } from './services/thumbs.js';
import { createV1Router } from './routes/v1.js';
import { createMediaRouter } from './routes/media.js';
import { createLibrary } from './services/library.js';
import { cors } from './lib/cors.js';
import { openDb } from './services/db.js';
import { createProfiles, DEFAULT_PROFILE_PINS } from './services/profiles.js';
import { createProfilesRouter } from './routes/profiles.js';
import { createHistory } from './services/history.js';
import { createDevices } from './services/devices.js';
import { createSubtitles } from './services/subtitles.js';
import { createDevicesRouter } from './routes/devices.js';
import { errorHandler, notFound, HttpError } from './lib/errors.js';

/** Factory testeable: arma la app Express a partir de la configuración (ver config.js). */
export function createApp(config, deps = {}) {
  const ffmpeg = deps.ffmpeg ?? createFfmpeg(config);
  const thumbs =
    deps.thumbs ??
    createThumbs({ ffmpeg, mediaRoot: config.mediaRoot, thumbsDir: config.thumbsDir });
  const db = deps.db ?? openDb(config.dbPath ?? ':memory:');
  const subtitles = deps.subtitles ?? createSubtitles({ db });
  const library =
    deps.library ??
    createLibrary({
      mediaRoot: config.mediaRoot,
      publicBaseUrl: config.publicBaseUrl,
      detectLang: subtitles.detectLang,
    });
  const profiles =
    deps.profiles ?? createProfiles({ db, seedPins: config.profilePins ?? DEFAULT_PROFILE_PINS });
  const history = deps.history ?? createHistory({ db });
  const devices =
    deps.devices ?? createDevices({ db, activeSeconds: config.deviceActiveSeconds ?? undefined });

  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      // Sin CSP por ahora: la interfaz de TV corre en el WebView de la app (pendiente definirla).
      contentSecurityPolicy: false,
      // El Chromecast carga videos/imágenes desde otro origen.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  if (config.logFormat !== 'off') app.use(morgan(config.logFormat));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // API v1 + archivos para el front nuevo y el Chromecast (con CORS).
  const withCors = cors(config.corsOrigins ?? ['*']);
  app.use('/api/v1/profiles', withCors, createProfilesRouter({ profiles }));
  app.use('/api/v1/devices', withCors, createDevicesRouter({ devices, profiles, library }));
  app.use('/api/v1', withCors, createV1Router({ config, library, profiles, history, subtitles }));
  app.use('/media', withCors, createMediaRouter({ library, thumbs }));

  // Interfaz nueva para la TV (apps/tv, WU-11). Ruteo por hash → no necesita fallback SPA.
  if (config.tvDir) {
    app.use('/tv', (req, res, next) =>
      req.originalUrl === '/tv' ? res.redirect(301, '/tv/') : next(),
    );
    app.use('/tv', express.static(config.tvDir, { index: 'index.html', maxAge: '1h' }));
    app.use('/tv', (req, _res, next) =>
      next(
        req.path === '/'
          ? new HttpError(
              503,
              'TV_NOT_BUILT',
              'La interfaz de TV no está compilada: npm run build -w @s-hub/tv',
            )
          : undefined,
      ),
    );
  }

  // La raíz lleva a la interfaz de TV (el front Angular viejo se eliminó en WU-15).
  if (config.tvDir) app.get('/', (_req, res) => res.redirect(302, '/tv/'));

  app.use(notFound);
  app.use(errorHandler);
  app.locals.db = db;
  app.locals.profiles = profiles;
  return app;
}
