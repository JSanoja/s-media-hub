// Miniaturas de videos. Se guardan en CACHE_DIR/thumbs espejando la estructura de la biblioteca;
// nunca se escribe dentro de MEDIA_ROOT. WU-06 suma cola con concurrencia y generación on-demand.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { resolveInside, toSafeSegments, VIDEO_EXTENSIONS } from '../lib/safePath.js';

export function createThumbs({ ffmpeg, mediaRoot, thumbsDir }) {
  const inFlight = new Map(); // dedupe: misma miniatura pedida N veces = 1 proceso

  /** Ruta de la miniatura en el cache: <thumbsDir>/<rel>.jpg (rel ya validado). */
  const thumbPathFor = (rel) => `${path.join(thumbsDir, ...toSafeSegments(rel))}.jpg`;

  async function generate(rel) {
    // Valida ANTES de lanzar ffmpeg: dentro de la biblioteca, existe y es un video.
    const file = await resolveInside(mediaRoot, rel, {
      type: 'file',
      extensions: VIDEO_EXTENSIONS,
    });
    const out = thumbPathFor(rel);
    if (inFlight.has(out)) return inFlight.get(out);
    const job = (async () => {
      await mkdir(path.dirname(out), { recursive: true });
      // Frame a la mitad del video (equivalente al screenshots({ count: 1 }) original).
      const duration = await ffmpeg.probeDuration(file).catch(() => null);
      await ffmpeg.screenshot(file, out, { atSec: duration ? duration / 2 : 0 });
      console.log(`[thumbs] generada ${path.relative(thumbsDir, out)}`);
      return out;
    })().finally(() => inFlight.delete(out));
    inFlight.set(out, job);
    return job;
  }

  return { generate, thumbPathFor };
}
