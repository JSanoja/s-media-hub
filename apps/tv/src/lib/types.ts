// Contrato de la API v1 (espejo de packages/shared/src/index.js).
export interface PublicConfig {
  publicBaseUrl: string;
  castReceiverAppId: string;
  version: string;
}
export interface Subtitle {
  id: string;
  lang: string;
  label: string;
  /** De dónde salió el idioma (WU-18): nombre del archivo, contenido o ninguno ("und"). */
  langSource: 'name' | 'content' | null;
  url: string;
}
export interface Progress {
  positionSec: number;
  durationSec: number | null;
  watched: boolean;
  updatedAt: string;
}
export interface Item {
  id: string;
  type: 'movie' | 'episode' | 'video';
  title: string | null;
  year: number | null;
  fileName: string;
  folderId: string;
  contentType: string;
  streamUrl: string;
  thumbUrl: string;
  posterUrl: string | null;
  durationSec: number | null;
  castCompatible: boolean | null;
  progress: Progress | null;
  series?: string;
  seriesId?: string;
  season?: number;
  episode?: number;
  size?: number;
  subtitles?: Subtitle[];
}
export interface FolderSummary {
  id: string;
  type: 'folder' | 'movie' | 'series' | 'season';
  title: string;
  year: number | null;
  posterUrl: string | null;
  videoCount: number;
  watchedCount?: number;
  season?: number;
  itemId?: string;
}
export interface Folder {
  id: string;
  type: 'library' | 'folder' | 'movie' | 'series' | 'season';
  title: string;
  year: number | null;
  parentId: string | null;
  posterUrl: string | null;
  folders: FolderSummary[];
  items: Item[];
}
