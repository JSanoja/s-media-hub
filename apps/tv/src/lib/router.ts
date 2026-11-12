import { useEffect, useState } from 'preact/hooks';

// Router por hash (#/folder/<id>): el historial del WebView/navegador maneja "Atrás".
export type Route =
  | { name: 'home' }
  | { name: 'folder'; id: string }
  | { name: 'item'; id: string }
  | { name: 'play'; id: string; start?: number }
  | { name: 'profile' };

export function parseHash(hash = location.hash): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const [, name, id] = path.split('/');
  if (name === 'play' && id) {
    const t = Number(new URLSearchParams(query).get('t'));
    return Number.isFinite(t) && query ? { name, id, start: t } : { name, id };
  }
  if ((name === 'folder' || name === 'item') && id) return { name, id };
  if (name === 'profile') return { name };
  return { name: 'home' };
}

export const href = (r: Route) => {
  if (r.name === 'home') return '#/';
  if (r.name === 'profile') return '#/profile';
  const base = `#/${r.name}/${r.id}`;
  return r.name === 'play' && r.start !== undefined ? `${base}?t=${Math.floor(r.start)}` : base;
};

export function navigate(r: Route, { replace = false } = {}) {
  if (replace) location.replace(href(r));
  else location.hash = href(r);
}

export function goBack() {
  if (history.length > 1 && location.hash && location.hash !== '#/') history.back();
  else navigate({ name: 'home' }, { replace: true });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
