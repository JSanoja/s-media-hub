// Heartbeat del dispositivo (WU-19): al abrir, cada 60 s y al cambiar el estado del reproductor.
// Mientras el reproductor nativo está abierto, el heartbeat lo manda la app Android (PlayerActivity)
// y la web se calla para no pisar "qué está viendo".
import { api } from './api';
import { nativeDeviceInfo } from './native';
import { deviceId } from './session';

const EVERY_MS = 60_000;

export interface NowPlaying {
  itemId: string;
  positionSec: number;
  paused: boolean;
}

let nowPlaying: NowPlaying | null = null;
let nativePlaying = false;
let timer: number | undefined;

/** Nombre legible en el navegador: "Chrome en Windows". */
function browserName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} en ${os}` : browser;
}

function identity() {
  const native = nativeDeviceInfo();
  if (native) return native;
  return { kind: 'browser' as const, name: browserName(), model: null, appVersion: null };
}

export function sendHeartbeat() {
  if (nativePlaying) return;
  api.heartbeat({ deviceId: deviceId(), ...identity(), nowPlaying }).catch(() => {});
}

/** Lo llama el reproductor web: `null` al salir. Manda heartbeat si cambió play/pausa/video. */
export function setNowPlaying(np: NowPlaying | null) {
  const changed =
    (np === null) !== (nowPlaying === null) ||
    np?.itemId !== nowPlaying?.itemId ||
    np?.paused !== nowPlaying?.paused;
  nowPlaying = np;
  if (changed) sendHeartbeat();
}

/** El reproductor nativo toma (true) o devuelve (false) el reporte de lo que se está viendo. */
export function setNativePlaying(playing: boolean) {
  nativePlaying = playing;
  if (!playing) {
    nowPlaying = null;
    sendHeartbeat();
  }
}

export function startHeartbeat() {
  if (timer !== undefined) return;
  sendHeartbeat();
  timer = window.setInterval(sendHeartbeat, EVERY_MS);
  // Al volver a la pestaña/app, avisar enseguida.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sendHeartbeat();
  });
}
