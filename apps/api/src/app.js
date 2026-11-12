import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import { createFfmpeg } from './services/ffmpeg.js';
import { createThumbs } from './services/thumbs.js';
import { createLegacyRouter } from './routes/legacy.js';
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
import { resolveInside, SERVABLE_EXTENSIONS } from './lib/safePath.js';

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
      // CSP se define en WU-11 junto con el front nuevo (el Angular viejo usa Google Fonts).
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

  app.use('/api', createLegacyRouter({ mediaRoot: config.mediaRoot, thumbs }));

  // Biblioteca (solo lectura, con HTTP Range) y miniaturas generadas.
  // /source es el prefijo legacy que usa el front viejo (el front nuevo usa /media/:id).
  app.use('/source', async (req, _res, next) => {
    let rel;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return next(new HttpError(400, 'INVALID_PATH', 'Ruta mal codificada'));
    }
    // Solo archivos existentes, dentro de MEDIA_ROOT y con extensión permitida.
    await resolveInside(config.mediaRoot, rel, { type: 'file', extensions: SERVABLE_EXTENSIONS });
    next();
  });
  app.use('/source', express.static(config.mediaRoot, { index: false, dotfiles: 'deny' }));
  app.use('/thumbs', express.static(config.thumbsDir, { index: false, dotfiles: 'deny' }));

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

  // Front Angular viejo (build compilado), hasta WU-15.
  app.use(express.static(config.publicDir));

  app.use(notFound);
  app.use(errorHandler);
  app.locals.db = db;
  app.locals.profiles = profiles;
  return app;
}
