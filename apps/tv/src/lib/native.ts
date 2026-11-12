// Puente con la app Android TV (WU-12). Si existe, el video lo reproduce el reproductor nativo
// (Media3: MKV, HEVC, AC3, SRT). Si no, se usa el <video> HTML5 (navegador / desarrollo).
import type { Item } from './types';
import { deviceId, getSession } from './session';
import { subtitleScale } from './prefs';
import { setNativePlaying } from './devices';

interface NativeBridge {
  play(json: string): void;
  openSettings?(): void;
  serverUrl?(): string;
  version?(): string;
  /** JSON {kind, name, model, appVersion} del dispositivo (WU-19). */
  deviceInfo?(): string;
}
declare global {
  interface Window {
    SHubPlayer?: NativeBridge;
  }
}

export const hasNativePlayer = () => typeof window.SHubPlayer?.play === 'function';

/** El reproductor nativo usa el token del perfil para guardar el progreso (WU-09). */
export function playNative(item: Item, startSec = 0) {
  setNativePlaying(true);
  window.SHubPlayer!.play(
    JSON.stringify({
      item,
      startSec,
      profileToken: getSession()?.token ?? null,
      deviceId: deviceId(),
      subtitleScale: subtitleScale(),
    }),
  );
}

export const canOpenSettings = () => typeof window.SHubPlayer?.openSettings === 'function';
export const openNativeSettings = () => window.SHubPlayer?.openSettings?.();

export interface DeviceInfo {
  kind: 'android-tv' | 'browser';
  name: string | null;
  model: string | null;
  appVersion: string | null;
}

/** Datos del dispositivo que da la app Android TV, o null en un navegador. */
export function nativeDeviceInfo(): DeviceInfo | null {
  try {
    const raw = window.SHubPlayer?.deviceInfo?.();
    return raw ? (JSON.parse(raw) as DeviceInfo) : null;
  } catch {
    return null;
  }
}

// Al volver del reproductor nativo, la web retoma el heartbeat (WU-19).
window.addEventListener('shub:playback', () => setNativePlaying(false));
