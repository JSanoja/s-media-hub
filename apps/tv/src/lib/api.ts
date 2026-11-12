import type { Folder, Item, Progress, PublicConfig } from './types';
import { getSession, type Profile, type Session } from './session';

// Base de la API: misma origen (la interfaz la sirve la API) o ?api=http://host:puerto para desarrollo.
const BASE = (() => {
  const param = new URLSearchParams(location.search).get('api');
  return param ? param.replace(/\/+$/, '') : '';
})();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getSession()?.token;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'X-Profile-Token': token } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor de S-HUB', 'NETWORK');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const { code, message, ...details } = data?.error ?? {};
    throw new ApiError(res.status, message ?? `Error ${res.status}`, code, details);
  }
  return (res.status === 204 ? undefined : res.json()) as Promise<T>;
}

const get = <T>(path: string) => request<T>('GET', path);

export const api = {
  config: () => get<PublicConfig>('/api/v1/config'),
  library: (id?: string) =>
    get<Folder>(`/api/v1/library${id ? `?path=${encodeURIComponent(id)}` : ''}`),
  item: (id: string) => get<Item>(`/api/v1/items/${id}`),
  next: (id: string) => get<{ next: Item | null }>(`/api/v1/items/${id}/next`),
  // Historial por perfil (WU-09)
  continueWatching: () => get<Item[]>('/api/v1/continue-watching'),
  reportProgress: (
    id: string,
    body: { positionSec: number; durationSec?: number; deviceId: string; ended?: boolean },
  ) => request<Progress>('PUT', `/api/v1/items/${id}/progress`, body),
  setWatched: (id: string, watched: boolean) =>
    request<Progress>(watched ? 'POST' : 'DELETE', `/api/v1/items/${id}/watched`),
  // Dispositivos (WU-19)
  heartbeat: (body: {
    deviceId: string;
    kind: 'android-tv' | 'browser';
    name: string | null;
    model: string | null;
    appVersion: string | null;
    nowPlaying: { itemId: string; positionSec: number; paused: boolean } | null;
  }) => request<unknown>('POST', '/api/v1/devices/heartbeat', body),
  // Perfiles (WU-21)
  profiles: () => get<Profile[]>('/api/v1/profiles'),
  me: () => get<Profile>('/api/v1/profiles/me'),
  login: (id: string, pin: string, deviceId: string) =>
    request<Session>('POST', `/api/v1/profiles/${id}/session`, { pin, deviceId }),
  logout: () => request<void>('DELETE', '/api/v1/profiles/session'),
  changePin: (id: string, currentPin: string, newPin: string, deviceId: string) =>
    request<void>('PUT', `/api/v1/profiles/${id}/pin`, { currentPin, newPin, deviceId }),
};
