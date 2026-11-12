// Mueve las miniaturas viejas "<video>.mp4.jpg" que la API anterior escribía dentro de la
// biblioteca hacia CACHE_DIR/thumbs (misma estructura). Única excepción a "no escribir en MEDIA_ROOT".
// Uso: npm run media:migrate-thumbs [-- --dry-run]
import { readdir, mkdir, copyFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

const dryRun = process.argv.includes('--dry-run');
const config = loadConfig();

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(mp4|m4v|mkv|webm)\.jpg$/i.test(entry.name)) yield full;
  }
}

let moved = 0;
for await (const file of walk(config.mediaRoot)) {
  const rel = path.relative(config.mediaRoot, file);
  const dest = path.join(config.thumbsDir, rel);
  console.log(`${dryRun ? '[dry-run] ' : ''}${rel} → ${path.relative(config.cacheDir, dest)}`);
  if (dryRun) continue;
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(file, dest);
  if ((await stat(dest)).size === (await stat(file)).size) await unlink(file);
  moved++;
}
console.log(
  dryRun ? 'Dry-run terminado.' : `Listo: ${moved} miniatura(s) movidas a ${config.thumbsDir}`,
);
