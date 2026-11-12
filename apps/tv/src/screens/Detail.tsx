import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { focusInitial } from '../lib/focus';
import { bytes, clock, itemLabel, progressPct } from '../lib/format';
import { playItem, resumeAt } from '../lib/play';
import { navigate } from '../lib/router';
import type { Item } from '../lib/types';
import { ErrorView, Loading, useLoad } from './common';

export function Detail({ id }: { id: string }) {
  const { data, error, loading, retry } = useLoad(() => api.item(id), [id]);
  const [item, setItem] = useState<Item | null>(null);
  useEffect(() => setItem(data ?? null), [data]);
  useEffect(() => {
    if (data) focusInitial();
  }, [data]);
  // Al volver del reproductor nativo, recargar el progreso.
  useEffect(() => {
    window.addEventListener('shub:playback', retry);
    return () => window.removeEventListener('shub:playback', retry);
  }, []);

  if (loading && !item) return <Loading />;
  if (error || !item) return <ErrorView error={error ?? new Error('Sin datos')} onRetry={retry} />;

  const subs = item.subtitles ?? [];
  const resume = resumeAt(item);
  const watched = item.progress?.watched ?? false;
  const pct = progressPct(item.progress);

  const toggleWatched = async () => {
    const progress = await api.setWatched(item.id, !watched).catch(() => null);
    if (progress) setItem({ ...item, progress });
  };

  return (
    <main class="screen detail">
      {item.posterUrl && (
        <div class="backdrop" style={{ backgroundImage: `url("${item.posterUrl}")` }} />
      )}
      <div class="detail-body">
        {item.posterUrl && <img class="detail-poster" src={item.posterUrl} alt="" />}
        <div class="detail-info">
          <span class="eyebrow">
            {item.type === 'episode'
              ? `${item.series} · Temporada ${item.season}`
              : item.type === 'movie'
                ? 'Película'
                : 'Video'}
            {watched && <span class="tag-watched">✓ Visto</span>}
          </span>
          <h1 class="page-title">{itemLabel(item)}</h1>
          <p class="meta">
            {[item.year, item.fileName.split('.').pop()?.toUpperCase(), bytes(item.size)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {subs.length > 0 && <p class="meta">Subtítulos: {subs.map((s) => s.label).join(', ')}</p>}
          {pct != null && (
            <div class="detail-progress">
              <div class="progress">
                <div class="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span class="meta">
                Viste {clock(resume)} de {clock(item.progress!.durationSec ?? 0)}
              </span>
            </div>
          )}
          <div class="actions">
            {resume > 0 ? (
              <>
                <button
                  class="focusable btn btn-primary"
                  data-key="play"
                  data-autofocus
                  onClick={() => playItem(item, resume)}
                >
                  ▶ Continuar ({clock(resume)})
                </button>
                <button class="focusable btn" data-key="restart" onClick={() => playItem(item, 0)}>
                  Desde el principio
                </button>
              </>
            ) : (
              <button
                class="focusable btn btn-primary"
                data-key="play"
                data-autofocus
                onClick={() => playItem(item, 0)}
              >
                {watched ? '↺ Volver a ver' : '▶ Reproducir'}
              </button>
            )}
            <button class="focusable btn" data-key="watched" onClick={toggleWatched}>
              {watched ? 'Marcar como no visto' : '✓ Marcar como visto'}
            </button>
            {item.type === 'episode' && item.seriesId && (
              <button
                class="focusable btn"
                data-key="series"
                onClick={() => navigate({ name: 'folder', id: item.seriesId! })}
              >
                Ver serie
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
