// Biblioteca: recorre MEDIA_ROOT bajo demanda y arma las respuestas de la API v1.
// Sin índice persistente todavía (llega en WU-06 con SQLite + ffprobe).
import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { HttpError } from '../lib/errors.js';
import { encodeId, decodeId } from '../lib/ids.js';
import {
  resolveInside,
  VIDEO_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  IMAGE_EXTENSIONS,
} from '../lib/safePath.js';
import {
  naturalCompare,
  parseSeasonFolder,
  parseEpisode,
  parseTitleYear,
  parseFolderTitle,
  episodeTitle,
} from '../lib/naming.js';
import { subtitleLang, subtitleLabel } from '../lib/subtitles.js';

const CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
};
const COVER_NAMES = ['cover', 'poster', 'folder'];
const COVER_EXT_ORDER = ['.webp', '.jpg', '.jpeg', '.png'];

const ext = (name) => path.extname(name).toLowerCase();
const isVideo = (name) => VIDEO_EXTENSIONS.has(ext(name));
const isSubtitle = (name) => SUBTITLE_EXTENSIONS.has(ext(name));
const stem = (name) => name.slice(0, name.length - path.extname(name).length);

export function createLibrary({ mediaRoot, publicBaseUrl, detectLang = null }) {
  const url = (p) => `${publicBaseUrl}${p}`;
  const toRel = (segments) => `/${segments.join('/')}`;

  /** Lee una carpeta (sin ocultos) ordenada naturalmente. */
  async function readFolder(segments) {
    const dir = await resolveInside(mediaRoot, toRel(segments), { type: 'dir' });
    const entries = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => !d.name.startsWith('.'))
      .sort((a, b) => naturalCompare(a.name, b.name));
    return {
      dirs: entries.filter((d) => d.isDirectory()).map((d) => d.name),
      files: entries.filter((d) => d.isFile()).map((d) => d.name),
    };
  }

  const tryReadFolder = (segments) => readFolder(segments).catch(() => ({ dirs: [], files: [] }));

  function findCoverName(files) {
    const covers = files.filter(
      (f) => IMAGE_EXTENSIONS.has(ext(f)) && COVER_NAMES.includes(stem(f).toLowerCase()),
    );
    covers.sort(
      (a, b) =>
        COVER_NAMES.indexOf(stem(a).toLowerCase()) - COVER_NAMES.indexOf(stem(b).toLowerCase()) ||
        COVER_EXT_ORDER.indexOf(ext(a)) - COVER_EXT_ORDER.indexOf(ext(b)),
    );
    return covers[0] ?? null;
  }

  /** Tipo de carpeta según su nombre y contenido (un nivel). */
  function classify(name, { dirs, files }) {
    const videos = files.filter(isVideo);
    if (name && parseSeasonFolder(name) !== null) return 'season';
    if (dirs.some((d) => parseSeasonFolder(d) !== null)) return 'series';
    if (videos.length > 1 && videos.filter((v) => parseEpisode(v)).length >= videos.length / 2) {
      return 'series';
    }
    if (videos.length === 1 && dirs.length === 0) return 'movie';
    return name ? 'folder' : 'library';
  }

  const coverUrl = (segments) => url(`/media/folders/${encodeId(segments)}/cover`);

  /** Resumen de una subcarpeta (para grillas). */
  async function folderSummary(segments) {
    const name = segments.at(-1);
    const content = await tryReadFolder(segments);
    const type = classify(name, content);
    const { title, year } = parseFolderTitle(name);
    const cover = findCoverName(content.files);
    const videos = content.files.filter(isVideo);
    // Ids de todos los videos que "contiene" (en una serie, también los de sus temporadas):
    // sirven para videoCount y para el conteo de vistos por perfil (WU-09).
    const videoIds = videos.map((v) => encodeId([...segments, v]));
    if (type === 'series') {
      for (const d of content.dirs.filter((x) => parseSeasonFolder(x) !== null)) {
        const season = await tryReadFolder([...segments, d]);
        for (const v of season.files.filter(isVideo)) videoIds.push(encodeId([...segments, d, v]));
      }
    }
    const summary = {
      id: encodeId(segments),
      type,
      title: type === 'season' ? `Temporada ${parseSeasonFolder(name)}` : title,
      year: type === 'movie' || type === 'series' ? year : null,
      posterUrl: cover ? coverUrl(segments) : null,
      videoCount: videoIds.length,
    };
    // No enumerable: no sale en el JSON, lo usa la capa de historial.
    Object.defineProperty(summary, 'videoIds', { value: videoIds, enumerable: false });
    if (type === 'season') summary.season = parseSeasonFolder(name);
    if (type === 'movie') summary.itemId = encodeId([...segments, videos[0]]);
    return summary;
  }

  /** Busca el póster más cercano subiendo por las carpetas (sin llegar a la raíz). */
  async function nearestPoster(dirSegments) {
    for (let i = dirSegments.length; i > 0; i--) {
      const segs = dirSegments.slice(0, i);
      const { files } = await tryReadFolder(segs);
      if (findCoverName(files)) return coverUrl(segs);
    }
    return null;
  }

  /**
   * Subtítulos de un video. Idioma: el del nombre ("peli.es.srt") gana; si no dice, se detecta por
   * el contenido (WU-18, cacheado); si tampoco se puede, "und".
   */
  async function subtitlesFor(dirSegments, files, videoName) {
    const videos = files.filter(isVideo);
    const base = stem(videoName);
    const subs = files.filter(isSubtitle).filter((s) => s.startsWith(base) || videos.length === 1);
    return Promise.all(
      subs.map(async (s) => {
        const id = encodeId([...dirSegments, s]);
        const fromName = subtitleLang(s, base);
        let lang = fromName.lang;
        let langSource = lang === 'und' ? null : 'name';
        if (detectLang) {
          const abs = path.join(mediaRoot, ...dirSegments, s);
          const detected = await detectLang(abs, { nameLang: lang });
          if (lang === 'und' && detected) {
            lang = detected;
            langSource = 'content';
          }
        }
        return {
          id,
          lang,
          label: subtitleLabel(lang, fromName.forced),
          langSource,
          url: url(`/media/${id}/subtitles.vtt`),
        };
      }),
    );
  }

  /** Arma un item (video) a partir de su ruta. */
  async function buildItem(segments, { withDetails = true } = {}) {
    const fileName = segments.at(-1);
    const dirSegments = segments.slice(0, -1);
    const parentName = dirSegments.at(-1);
    const parentContent = await tryReadFolder(dirSegments);
    const parentType = classify(parentName, parentContent);
    const id = encodeId(segments);

    const item = {
      id,
      type: 'video',
      title: null,
      year: null,
      fileName,
      folderId: encodeId(dirSegments),
      contentType: CONTENT_TYPES[ext(fileName)] ?? 'application/octet-stream',
      streamUrl: url(`/media/${id}`),
      thumbUrl: url(`/media/${id}/thumb.jpg`),
      posterUrl: null,
      durationSec: null, // WU-06 (ffprobe)
      castCompatible: null, // WU-06/WU-08
      progress: null, // WU-09 (por perfil)
    };

    const ep = parseEpisode(fileName);
    if (parentType === 'movie') {
      Object.assign(item, { type: 'movie' }, parseTitleYear(parentName));
    } else if (parentType === 'season' || (parentType === 'series' && ep)) {
      const seriesSegments = parentType === 'season' ? dirSegments.slice(0, -1) : dirSegments;
      const season = ep?.season ?? parseSeasonFolder(parentName) ?? 1;
      const episode = ep?.episode ?? parentContent.files.filter(isVideo).indexOf(fileName) + 1;
      Object.assign(item, {
        type: 'episode',
        series: seriesSegments.length ? parseFolderTitle(seriesSegments.at(-1)).title : null,
        seriesId: encodeId(seriesSegments),
        season,
        episode,
        title: episodeTitle(fileName, episode),
      });
    } else {
      Object.assign(item, parseTitleYear(fileName));
    }

    if (withDetails) {
      const real = await resolveInside(mediaRoot, toRel(segments), {
        type: 'file',
        extensions: VIDEO_EXTENSIONS,
      });
      item.size = (await stat(real)).size;
      item.posterUrl = await nearestPoster(dirSegments);
      item.subtitles = await subtitlesFor(dirSegments, parentContent.files, fileName);
    }
    return item;
  }

  /** GET /api/v1/library?path=<id> */
  async function getFolder(id) {
    const segments = decodeId(id);
    const content = await readFolder(segments);
    const name = segments.at(-1);
    const type = classify(name, content);
    const { title, year } = name ? parseFolderTitle(name) : { title: 'Biblioteca', year: null };
    const cover = findCoverName(content.files);
    return {
      id: encodeId(segments),
      type,
      title: type === 'season' ? `Temporada ${parseSeasonFolder(name)}` : title,
      year: type === 'movie' || type === 'series' ? year : null,
      parentId: segments.length ? encodeId(segments.slice(0, -1)) : null,
      posterUrl: cover && segments.length ? coverUrl(segments) : null,
      folders: await Promise.all(content.dirs.map((d) => folderSummary([...segments, d]))),
      items: await Promise.all(
        content.files
          .filter(isVideo)
          .map((f) => buildItem([...segments, f], { withDetails: false })),
      ),
    };
  }

  async function itemSegments(id) {
    const segments = decodeId(id);
    if (!segments.length || !isVideo(segments.at(-1))) {
      throw new HttpError(404, 'NOT_FOUND', 'No es un video');
    }
    return segments;
  }

  /** GET /api/v1/items/:id */
  async function getItem(id) {
    return buildItem(await itemSegments(id));
  }

  /** GET /api/v1/items/:id/next → siguiente video (cruza temporadas) o null. */
  async function getNext(id) {
    const segments = await itemSegments(id);
    const dirSegments = segments.slice(0, -1);
    const { files } = await readFolder(dirSegments);
    const videos = files.filter(isVideo);
    const idx = videos.indexOf(segments.at(-1));
    if (idx >= 0 && idx < videos.length - 1) return buildItem([...dirSegments, videos[idx + 1]]);

    // Fin de la temporada → primer video de la temporada siguiente.
    const parentName = dirSegments.at(-1);
    if (parentName && parseSeasonFolder(parentName) !== null) {
      const seriesSegments = dirSegments.slice(0, -1);
      const { dirs } = await readFolder(seriesSegments);
      const seasons = dirs.filter((d) => parseSeasonFolder(d) !== null);
      for (const next of seasons.slice(seasons.indexOf(parentName) + 1)) {
        const first = (await tryReadFolder([...seriesSegments, next])).files.find(isVideo);
        if (first) return buildItem([...seriesSegments, next, first]);
      }
    }
    return null;
  }

  /** Ruta real del cover de una carpeta (o 404). */
  async function getCoverPath(folderId) {
    const segments = decodeId(folderId);
    const { files } = await readFolder(segments);
    const cover = findCoverName(files);
    if (!cover) throw new HttpError(404, 'NOT_FOUND', 'La carpeta no tiene cover');
    return resolveInside(mediaRoot, toRel([...segments, cover]), {
      type: 'file',
      extensions: IMAGE_EXTENSIONS,
    });
  }

  /** Ruta real de un archivo (video o subtítulo) a partir de su id. */
  async function getFilePath(id, extensions) {
    const segments = decodeId(id);
    if (!segments.length) throw new HttpError(404, 'NOT_FOUND', 'No existe');
    return resolveInside(mediaRoot, toRel(segments), { type: 'file', extensions });
  }

  return { getFolder, getItem, getNext, getCoverPath, getFilePath, toRel, decodeId };
}
