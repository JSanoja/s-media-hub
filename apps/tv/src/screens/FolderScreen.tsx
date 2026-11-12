import { useEffect } from 'preact/hooks';
import { api } from '../lib/api';
import { focusInitial } from '../lib/focus';
import { pad2, progressPct } from '../lib/format';
import { isDone, seenLabel } from './Home';
import { navigate } from '../lib/router';
import { Card, ErrorView, Loading, Row, useLoad } from './common';

const TYPE_LABEL = {
  library: '',
  folder: 'Carpeta',
  movie: 'Película',
  series: 'Serie',
  season: 'Temporada',
};

export function FolderScreen({ id }: { id: string }) {
  const { data, error, loading, retry } = useLoad(() => api.library(id), [id]);
  useEffect(() => {
    if (data) focusInitial();
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView error={error ?? new Error('Sin datos')} onRetry={retry} />;

  const seasons = data.folders.filter((f) => f.type === 'season');
  const subfolders = data.folders.filter((f) => f.type !== 'season');

  return (
    <main class="screen">
      {data.posterUrl && (
        <div class="backdrop" style={{ backgroundImage: `url("${data.posterUrl}")` }} />
      )}
      <header class="page-header">
        <span class="eyebrow">{TYPE_LABEL[data.type]}</span>
        <h1 class="page-title">
          {data.title} {data.year && <span class="muted">({data.year})</span>}
        </h1>
      </header>

      {seasons.length > 0 && (
        <Row title="Temporadas">
          {seasons.map((s, i) => (
            <Card
              key={s.id}
              id={s.id}
              title={s.title}
              subtitle={seenLabel(s) ?? `${s.videoCount} episodio${s.videoCount === 1 ? '' : 's'}`}
              image={s.posterUrl ?? data.posterUrl}
              watched={isDone(s)}
              autofocus={i === 0}
              onSelect={() => navigate({ name: 'folder', id: s.id })}
            />
          ))}
        </Row>
      )}

      {data.items.length > 0 && (
        <Row title={data.type === 'season' || data.type === 'series' ? 'Episodios' : 'Videos'}>
          {data.items.map((item, i) => (
            <Card
              key={item.id}
              id={item.id}
              wide
              title={
                item.type === 'episode'
                  ? `${pad2(item.episode ?? 0)}. ${item.title}`
                  : (item.title ?? item.fileName)
              }
              subtitle={
                item.type === 'episode'
                  ? `Temporada ${item.season}`
                  : item.year
                    ? String(item.year)
                    : undefined
              }
              image={item.thumbUrl}
              progress={progressPct(item.progress)}
              watched={item.progress?.watched}
              autofocus={seasons.length === 0 && i === 0}
              onSelect={() => navigate({ name: 'item', id: item.id })}
            />
          ))}
        </Row>
      )}

      {subfolders.length > 0 && (
        <Row title="Carpetas">
          {subfolders.map((f, i) => (
            <Card
              key={f.id}
              id={f.id}
              title={f.title}
              subtitle={seenLabel(f)}
              image={f.posterUrl}
              watched={isDone(f)}
              autofocus={seasons.length === 0 && data.items.length === 0 && i === 0}
              onSelect={() =>
                f.type === 'movie' && f.itemId
                  ? navigate({ name: 'item', id: f.itemId })
                  : navigate({ name: 'folder', id: f.id })
              }
            />
          ))}
        </Row>
      )}

      {data.folders.length === 0 && data.items.length === 0 && (
        <p class="muted">Esta carpeta está vacía.</p>
      )}
    </main>
  );
}
