// Sesión de perfil (WU-21) y id del dispositivo, guardados en el dispositivo.
// En la app Android TV, localStorage del WebView persiste entre reinicios.
export interface Profile {
  id: string;
  name: string;
  color: string;
}
export interface Session {
  token: string;
  profile: Profile;
}

const SESSION_KEY = 'shub.session';
const DEVICE_KEY = 'shub.deviceId';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: la sesión dura lo que la pantalla */
  }
};

let memory: Session | null = null;

export function getSession(): Session | null {
  if (memory) return memory;
  try {
    memory = JSON.parse(read(SESSION_KEY) ?? 'null');
  } catch {
    memory = null;
  }
  return memory;
}
export function saveSession(s: Session) {
  memory = s;
  write(SESSION_KEY, JSON.stringify(s));
}
export function clearSession() {
  memory = null;
  write(SESSION_KEY, null);
}

let deviceIdMemo: string | null = null;
/** Id estable del dispositivo. crypto.randomUUID no existe en http:// (contexto no seguro). */
export function deviceId(): string {
  if (deviceIdMemo) return deviceIdMemo;
  let id = read(DEVICE_KEY);
  if (!id) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    write(DEVICE_KEY, id);
  }
  deviceIdMemo = id;
  return id;
}
