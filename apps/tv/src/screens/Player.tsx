// Reproductor web (fallback / desarrollo). Dentro de la app Android TV se usa el nativo (Media3).
// Teclas: OK/Espacio = play/pausa · ←/→ = -10 s/+10 s · ↑ = subtítulos on/off · Atrás = salir.
import { useEffect, useRef, useState } from 'preact/hooks';
import { getSubtitleSize } from '../lib/prefs';
import { api } from '../lib/api';
import { setSpatialNavigation } from '../lib/focus';
import { clock, itemLabel } from '../lib/format';
import { navigate } from '../lib/router';
import { deviceId, getSession } from '../lib/session';
import { setNowPlaying } from '../lib/devices';
import { ErrorView, Loading, useLoad } from './common';

const SEEK = 10;

/** Mínimo entre dos guardados de progreso (salir del video o terminarlo guarda siempre). */
const PROGRESS_MIN_GAP_MS = 20_000;

export function Player({ id, start }: { id: string; start?: number }) {
  const { data: item, error, loading, retry } = useLoad(() => api.item(id), [id]);
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState({ current: 0, duration: 0, paused: true });
  const [overlay, setOverlay] = useState(true);
  const [subsOn, setSubsOn] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  // Arranca en "ahora": no tiene sentido guardar la posición 0 apenas empieza el video.
  const lastReport = useRef(Date.now());

  /**
   * Guarda el progreso en la API (WU-09) si hay perfil, como mucho una vez cada 20 s.
   * `force` (salir, terminar) guarda aunque el último guardado sea reciente.
   */
  const report = (ended = false, force = false) => {
    const v = video.current;
    if (!v || !getSession() || !Number.isFinite(v.currentTime)) return;
    if (!force && Date.now() - lastReport.current < PROGRESS_MIN_GAP_MS) return;
    lastReport.current = Date.now();
    api
      .reportProgress(id, {
        positionSec: ended ? v.duration || v.currentTime : v.currentTime,
        durationSec: Number.isFinite(v.duration) ? v.duration : undefined,
        deviceId: deviceId(),
        ended,
      })
      .catch(() => {});
  };
  // Al salir del reproductor (Atrás, otra ruta) se guarda la posición y deja de "estar viendo".
  useEffect(
    () => () => {
      report(false, true);
      setNowPlaying(null);
    },
    [],
  );
  /** Avisa al servidor qué se está viendo (WU-19). */
  const playing = (v: HTMLVideoElement) =>
    setNowPlaying({ itemId: id, positionSec: v.currentTime || 0, paused: v.paused });

  const poke = () => {
    setOverlay(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOverlay(false), 3000);
  };

  useEffect(() => {
    setSpatialNavigation(false);
    return () => setSpatialNavigation(true);
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    for (const t of Array.from(v.textTracks)) t.mode = subsOn ? 'showing' : 'hidden';
  }, [subsOn, item]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = video.current;
      if (!v) return;
      let handled = true;
      switch (e.key) {
        case 'Enter':
        case ' ':
        case 'MediaPlayPause':
          v.paused ? v.play() : v.pause();
          break;
        case 'MediaPlay':
          v.play();
          break;
        case 'MediaPause':
          v.pause();
          break;
        case 'ArrowRight':
        case 'MediaFastForward':
          v.currentTime = Math.min(v.duration || Infinity, v.currentTime + SEEK);
          break;
        case 'ArrowLeft':
        case 'MediaRewind':
          v.currentTime = Math.max(0, v.currentTime - SEEK);
          break;
        case 'ArrowUp':
          setSubsOn((s) => !s);
          break;
        case 'ArrowDown':
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        poke();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onEnded = async () => {
    report(true, true);
    const { next } = await api.next(id).catch(() => ({ next: null }));
    if (next) navigate({ name: 'play', id: next.id }, { replace: true });
    else history.back();
  };

  if (loading) return <Loading />;
  if (error || !item) return <ErrorView error={error ?? new Error('Sin datos')} onRetry={retry} />;

  const pct = time.duration ? (time.current / time.duration) * 100 : 0;
  const subs = item.subtitles ?? [];

  return (
    <div class="player" data-sub={getSubtitleSize()} onMouseMove={poke}>
      <video
        ref={video}
        src={item.streamUrl}
        crossOrigin="anonymous"
        autoPlay
        onLoadedMetadata={(e) => {
          // Retomar: ?t= de la ruta o el progreso guardado del perfil.
          const at =
            start ??
            (item.progress && item.progress.positionSec >= 30 ? item.progress.positionSec : 0);
          if (at > 0 && at < e.currentTarget.duration - 5) e.currentTarget.currentTime = at;
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime({ current: v.currentTime, duration: v.duration, paused: v.paused });
          if (Date.now() - lastReport.current >= PROGRESS_MIN_GAP_MS) {
            report();
            playing(v);
          }
        }}
        onPlay={(e) => {
          poke();
          playing(e.currentTarget);
        }}
        onPause={(e) => {
          setOverlay(true);
          report();
          playing(e.currentTarget);
        }}
        onEnded={onEnded}
        onError={() =>
          setMediaError(
            'El navegador no puede reproducir este formato. En la app de la TV se usa el reproductor nativo.',
          )
        }
      >
        {subs.map((s, i) => (
          <track
            key={s.id}
            kind="subtitles"
            src={s.url}
            srcLang={s.lang}
            label={s.label}
            default={i === 0}
          />
        ))}
      </video>
      {mediaError && <p class="player-error">{mediaError}</p>}
      <div class={`player-overlay ${overlay ? 'visible' : ''}`}>
        <div class="player-title">{itemLabel(item)}</div>
        <div class="progress">
          <div class="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div class="player-meta">
          <span>
            {time.paused ? '❚❚' : '▶'} {clock(time.current)} / {clock(time.duration)}
          </span>
          <span class="muted">
            ←/→ 10 s · OK pausa · ↑ subtítulos {subs.length ? (subsOn ? 'on' : 'off') : '—'} · Atrás
            salir
          </span>
        </div>
      </div>
    </div>
  );
}
