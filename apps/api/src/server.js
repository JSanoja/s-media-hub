import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { loadConfig, ConfigError } from './config.js';
import { createApp } from './app.js';
import { killAll } from './services/ffmpeg.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`\n✖ ${err.message}\n\nRevisá el .env (ver .env.example).\n`);
    process.exit(1);
  }
  throw err;
}

fs.mkdirSync(config.thumbsDir, { recursive: true });

const app = createApp(config);
const server =
  config.protocol === 'https'
    ? https.createServer(
        { cert: fs.readFileSync(config.tls.cert), key: fs.readFileSync(config.tls.key) },
        app,
      )
    : http.createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`El puerto ${config.port} ya está en uso`);
  else if (err.code === 'EADDRNOTAVAIL')
    console.error(
      `La IP ${config.host} no pertenece a esta PC (¿cambió la IP?). Revisá HOST/PUBLIC_HOST en el .env o usá HOST=0.0.0.0`,
    );
  else if (err.code === 'EACCES')
    console.error(`El puerto ${config.port} requiere privilegios elevados`);
  else console.error(err);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const { address, port } = server.address();
  console.log(`S-HUB API v${config.version}`);
  console.log(`  Escuchando:   ${config.protocol}://${address}:${port}`);
  console.log(`  URL pública:  ${config.publicBaseUrl}  (${config.publicHostSource})`);
  console.log(`  Biblioteca:   ${config.mediaRoot}`);
  console.log(`  Cache:        ${config.cacheDir}`);
  console.log(`  Receiver:     ${config.castReceiverAppId}`);
  for (const w of config.warnings) console.warn(`  ⚠ ${w}`);
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} recibido, cerrando...`);
  killAll();
  try {
    app.locals.db?.close();
  } catch {
    // ya cerrada
  }
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
