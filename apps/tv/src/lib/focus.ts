// Navegación espacial para el control remoto (D-pad): mueve el foco al elemento ".focusable"
// más cercano en la dirección de la flecha. OK/Enter = click (son <button>).
import { goBack } from './router';

type Dir = 'up' | 'down' | 'left' | 'right';
const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
// Teclas "Atrás": Escape/Backspace en navegador; GoBack/BrowserBack en Android TV.
const BACK_KEYS = new Set(['Escape', 'Backspace', 'GoBack', 'BrowserBack']);

const lastFocusByRoute = new Map<string, string>();
let disabled = false;

const focusables = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.focusable')).filter(
    (el) => el.offsetParent !== null && !el.hasAttribute('disabled'),
  );

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function pick(from: HTMLElement, dir: Dir): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ca = center(a);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of focusables()) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const cb = center(b);
    const dx = cb.x - ca.x;
    const dy = cb.y - ca.y;
    let main: number;
    let cross: number;
    if (dir === 'right') [main, cross] = [b.left - a.right, Math.abs(dy)];
    else if (dir === 'left') [main, cross] = [a.left - b.right, Math.abs(dy)];
    else if (dir === 'down') [main, cross] = [b.top - a.bottom, Math.abs(dx)];
    else [main, cross] = [a.top - b.bottom, Math.abs(dx)];
    // Debe estar en esa dirección (tolerancia de solapamiento de unos px).
    const inDir =
      dir === 'right' ? dx > 1 : dir === 'left' ? dx < -1 : dir === 'down' ? dy > 1 : dy < -1;
    if (!inDir || main < -a.width / 2) continue;
    // ←/→ solo dentro de la misma fila (solapamiento vertical); al final de la fila no se mueve.
    if ((dir === 'left' || dir === 'right') && (b.bottom <= a.top || b.top >= a.bottom)) continue;
    const score = Math.max(main, 0) + cross * (dir === 'up' || dir === 'down' ? 0.5 : 2);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export function focusEl(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  // Cerca del principio de la pantalla: volver del todo arriba para que el header se vea entero
  // ("nearest" solo muestra el elemento y deja el header cortado).
  const screen = el.closest<HTMLElement>('.screen');
  if (screen) {
    const offset =
      el.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop;
    if (offset < screen.clientHeight / 2) screen.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const key = el.dataset.key;
  if (key) lastFocusByRoute.set(location.hash, key);
}

/** Foco inicial de una pantalla: el último enfocado en esa ruta, [data-autofocus] o el primero. */
export function focusInitial() {
  requestAnimationFrame(() => {
    const key = lastFocusByRoute.get(location.hash);
    const remembered = key
      ? document.querySelector<HTMLElement>(`.focusable[data-key="${CSS.escape(key)}"]`)
      : null;
    focusEl(
      remembered ?? document.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0],
    );
  });
}

/** El reproductor maneja sus propias teclas. */
export function setSpatialNavigation(enabled: boolean) {
  disabled = !enabled;
}

export function installSpatialNavigation() {
  window.addEventListener('keydown', (e) => {
    if (BACK_KEYS.has(e.key) || e.keyCode === 4) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      goBack();
      return;
    }
    if (disabled) return;
    const dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    const current = document.activeElement as HTMLElement | null;
    if (!current || !current.classList.contains('focusable')) {
      focusEl(focusables()[0] ?? null);
      return;
    }
    const next = pick(current, dir);
    if (next) focusEl(next);
  });
  // Recordar foco al usar mouse/touch también (desarrollo en PC).
  window.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement;
    if (el.classList?.contains('focusable') && el.dataset.key) {
      lastFocusByRoute.set(location.hash, el.dataset.key);
    }
  });
}
