import type { Item, Progress } from './types';

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function itemLabel(item: Item) {
  if (item.type === 'episode')
    return `T${item.season} · E${pad2(item.episode ?? 0)} — ${item.title}`;
  return item.title ?? item.fileName;
}

export function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

export function bytes(n?: number) {
  if (!n) return '';
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(n / 1024 ** 2).toFixed(0)} MB`;
}

/** % visto (0–100) para la barra de progreso, o null si no corresponde. */
export function progressPct(p: Progress | null | undefined) {
  if (!p || !p.durationSec || p.positionSec < 30) return null;
  return Math.min(100, Math.max(2, (p.positionSec / p.durationSec) * 100));
}
