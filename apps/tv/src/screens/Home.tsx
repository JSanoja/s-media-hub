import { useEffect } from 'preact/hooks';
import { api } from '../lib/api';
import { focusInitial } from '../lib/focus';
import { getSession } from '../lib/session';
import { Avatar } from './Profiles';
import { navigate } from '../lib/router';
import { clock, itemLabel, progressPct } from '../lib/format';
import { playItem, resumeAt } from '../lib/play';
import type { FolderSummary } from '../lib/types';
import { Card, ErrorView, Loading, Row, useLoad } from './common';

const openFolder = (f: FolderSummary) =>
  f.type === 'movie' && f.itemId
    ? navigate({ name: 'item', id: f.itemId })
    : navigate({ name: 'folder', id: f.id });

/** ✓ si todos sus videos están vistos por el perfil activo. */
export const isDone = (f: FolderSummary) =>
  f.videoCount > 0 && (f.watchedCount ?? 0) >= f.videoCount;
/** "3/10 vistos" cuando está a medias. */
export const seenLabel = (f: FolderSummary) =>
  f.watchedCount && f.watchedCount < f.videoCount
    ? `${f.watchedCount}/${f.videoCount} vistos`
    : undefined;

export function Home() {
  const {
    data: loaded,
    error,
    loading,
    retry,
  } = useLoad(() => Promise.all([api.library(), api.continueWatching().catch(() => [])]), []);
  const [data, continueWatching] = loaded ?? [];
  useEffect(() => {
    if (data) focusInitial();
  }, [data]);
  // Al volver del reproductor nativo, refrescar "Seguir viendo".
  useEffect(() => {
    window.addEventListener('shub:playback', retry);
    return () => window.removeEventListener('shub:playback', retry);
  }, []);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorView error={error ?? new Error('Sin datos')} onRetry={retry} />;

  const movies = data.folders.filter((f) => f.type === 'movie');
  const series = data.folders.filter((f) => f.type === 'series');
  const others = data.folders.filter((f) => f.type !== 'movie' && f.type !== 'series');
  let first = true;
  const auto = () => (first ? ((first = false), true) : false);

  return (
    <main class="screen">
      <header class="brand">
        <span class="logo">S-HUB</span>
        {getSession() && (
          <button
            class="focusable profile-chip"
            data-key="profile"
            onClick={() => navigate({ name: 'profile' })}
          >
            <Avatar profile={getSession()!.profile} size="sm" />
            <span>{getSession()!.profile.name}</span>
          </button>
        )}
      </header>
      {data.folders.length === 0 && data.items.length === 0 && (
        <p class="muted center">La biblioteca está vacía.</p>
      )}
      {continueWatching && continueWatching.length > 0 && (
        <Row title="Seguir viendo">
          {continueWatching.map((i) => (
            <Card
              key={`cw-${i.id}`}
              id={`cw-${i.id}`}
              title={itemLabel(i)}
              subtitle={
                i.progress?.durationSec
                  ? `Quedan ${clock(i.progress.durationSec - i.progress.positionSec)}`
                  : undefined
              }
              image={i.thumbUrl}
              wide
              progress={progressPct(i.progress)}
              watched={i.progress?.watched}
              autofocus={auto()}
              onSelect={() => playItem(i, resumeAt(i))}
            />
          ))}
        </Row>
      )}
      {movies.length > 0 && (
        <Row title="Películas">
          {movies.map((f) => (
            <Card
              key={f.id}
              id={f.id}
              title={f.title}
              subtitle={f.year ? String(f.year) : undefined}
              image={f.posterUrl}
              watched={isDone(f)}
              autofocus={auto()}
              onSelect={() => openFolder(f)}
            />
          ))}
        </Row>
      )}
      {series.length > 0 && (
        <Row title="Series">
          {series.map((f) => (
            <Card
              key={f.id}
              id={f.id}
              title={f.title}
              subtitle={seenLabel(f)}
              image={f.posterUrl}
              watched={isDone(f)}
              autofocus={auto()}
              onSelect={() => openFolder(f)}
            />
          ))}
        </Row>
      )}
      {others.length > 0 && (
        <Row title="Carpetas">
          {others.map((f) => (
            <Card
              key={f.id}
              id={f.id}
              title={f.title}
              subtitle={seenLabel(f) ?? `${f.videoCount} video${f.videoCount === 1 ? '' : 's'}`}
              image={f.posterUrl}
              watched={isDone(f)}
              autofocus={auto()}
              onSelect={() => openFolder(f)}
            />
          ))}
        </Row>
      )}
      {data.items.length > 0 && (
        <Row title="Videos">
          {data.items.map((i) => (
            <Card
              key={i.id}
              id={i.id}
              title={i.title ?? i.fileName}
              image={i.thumbUrl}
              wide
              progress={progressPct(i.progress)}
              watched={i.progress?.watched}
              autofocus={auto()}
              onSelect={() => navigate({ name: 'item', id: i.id })}
            />
          ))}
        </Row>
      )}
    </main>
  );
}
