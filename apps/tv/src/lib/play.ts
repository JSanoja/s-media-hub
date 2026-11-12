// Reproducir un item: reproductor nativo (app Android TV) o el web (navegador).
import { hasNativePlayer, playNative } from './native';
import { navigate } from './router';
import type { Item } from './types';

export function playItem(item: Item, startSec = 0) {
  if (hasNativePlayer()) playNative(item, startSec);
  else navigate({ name: 'play', id: item.id, start: startSec });
}

/** Posición desde la que retomar (0 si no hay progreso útil). */
export const resumeAt = (item: Item) =>
  item.progress && item.progress.positionSec >= 30 ? item.progress.positionSec : 0;
