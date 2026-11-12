import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ApiError } from '../lib/api';
import { focusInitial } from '../lib/focus';

/** Carga asíncrona con estados (cargando / error / datos). */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: ApiError | Error; loading: boolean }>({
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    load()
      .then((data) => alive && setState({ data, loading: false }))
      .catch((error) => alive && setState({ error, loading: false }));
    return () => {
      alive = false;
    };
  }, [...deps, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

export function Loading() {
  return (
    <div class="center">
      <div class="spinner" aria-label="Cargando" />
    </div>
  );
}

export function ErrorView({ error, onRetry }: { error: Error; onRetry: () => void }) {
  useEffect(focusInitial, []);
  return (
    <div class="center column">
      <p class="error-title">Algo salió mal</p>
      <p class="muted">{error.message}</p>
      <button class="focusable btn" data-key="retry" data-autofocus onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

export function Row({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="row">
      <h2 class="row-title">{title}</h2>
      <div class="row-track">{children}</div>
    </section>
  );
}

/** Tarjeta de póster (2:3) o miniatura (16:9). */
export function Card(props: {
  id: string;
  title: string;
  subtitle?: string;
  image?: string | null;
  wide?: boolean;
  autofocus?: boolean;
  /** 0–100: barra de progreso (WU-09). */
  progress?: number | null;
  /** Visto ✓ (no se oculta, solo se marca). */
  watched?: boolean;
  onSelect: () => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <button
      class={`focusable card ${props.wide ? 'card-wide' : 'card-poster'} ${props.watched ? 'is-watched' : ''}`}
      data-key={props.id}
      data-autofocus={props.autofocus || undefined}
      onClick={props.onSelect}
    >
      <div class="card-art">
        {props.image && !broken ? (
          <img src={props.image} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div class="card-fallback">{props.title.slice(0, 1)}</div>
        )}
        {props.watched && (
          <span class="badge-watched" aria-label="Visto">
            ✓
          </span>
        )}
        {props.progress != null && (
          <div class="card-progress">
            <div class="card-progress-fill" style={{ width: `${props.progress}%` }} />
          </div>
        )}
      </div>
      <div class="card-text">
        <span class="card-title">{props.title}</span>
        {props.subtitle && <span class="card-subtitle">{props.subtitle}</span>}
      </div>
    </button>
  );
}
