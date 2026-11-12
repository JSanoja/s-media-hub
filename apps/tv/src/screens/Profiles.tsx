// Perfiles con PIN (WU-21): "¿Quién está viendo?", teclado de PIN y menú del perfil.
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError } from '../lib/api';
import { focusEl, focusInitial } from '../lib/focus';
import { canOpenSettings, openNativeSettings } from '../lib/native';
import { goBack } from '../lib/router';
import {
  getSubtitleSize,
  nextSubtitleSize,
  setSubtitleSize,
  SUBTITLE_SIZE_LABEL,
} from '../lib/prefs';
import { deviceId, getSession, saveSession, type Profile } from '../lib/session';
import { ErrorView, Loading, useLoad } from './common';

export function Avatar({ profile, size = 'lg' }: { profile: Profile; size?: 'sm' | 'lg' }) {
  return (
    <span class={`avatar avatar-${size}`} style={{ background: profile.color }}>
      {profile.name.slice(0, 1)}
    </span>
  );
}

/** Pantalla inicial: elegir perfil. */
export function ProfilePicker({ onPick }: { onPick: (p: Profile) => void }) {
  const { data, error, loading, retry } = useLoad(() => api.profiles(), []);
  useEffect(() => {
    if (data) focusInitial();
  }, [data]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorView error={error ?? new Error('Sin datos')} onRetry={retry} />;
  const last = getSession()?.profile.id;
  return (
    <main class="center column profiles">
      <span class="logo">S-HUB</span>
      <h1 class="page-title">¿Quién está viendo?</h1>
      <div class="profile-row">
        {data.map((p, i) => (
          <button
            key={p.id}
            class="focusable profile-card"
            data-key={`profile-${p.id}`}
            data-autofocus={(last ? p.id === last : i === 0) || undefined}
            onClick={() => onPick(p)}
          >
            <Avatar profile={p} />
            <span class="profile-name">{p.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'cancel'] as const;

/**
 * Teclado numérico para TV: grilla 3×4 navegable con flechas + OK, o teclas numéricas del control.
 * Con 4 dígitos llama a onSubmit; si devuelve un mensaje de error, lo muestra y limpia.
 */
export function PinPad(props: {
  profile: Profile;
  title: string;
  onSubmit: (pin: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef('');
  pinRef.current = pin;

  const submit = async (value: string) => {
    setBusy(true);
    const message = await props.onSubmit(value);
    setBusy(false);
    if (message) {
      setError(message);
      setPin('');
    }
  };
  const press = (k: (typeof KEYS)[number]) => {
    if (busy) return;
    if (k === 'cancel') return props.onCancel();
    if (k === 'back') return setPin((p) => p.slice(0, -1));
    setError(null);
    const next = (pinRef.current + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(next);
  };

  useEffect(() => {
    requestAnimationFrame(() => focusEl(document.querySelector<HTMLElement>('[data-key="pin-1"]')));
    // Teclas numéricas del control/teclado, Borrar y Atrás (antes que la navegación global).
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace' && pinRef.current) press('back');
      else if (['Escape', 'Backspace', 'GoBack', 'BrowserBack'].includes(e.key)) props.onCancel();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  return (
    <main class="center column profiles">
      <Avatar profile={props.profile} />
      <h1 class="page-title">{props.title}</h1>
      <div class={`pin-dots ${error ? 'shake' : ''}`} aria-label={`${pin.length} de 4 dígitos`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} class={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
        ))}
      </div>
      <p class={`pin-message ${error ? 'error' : 'muted'}`}>
        {error ?? (busy ? 'Verificando…' : ' ')}
      </p>
      <div class="pin-pad">
        {KEYS.map((k) => (
          <button
            key={k}
            class={`focusable pin-key ${k.length > 1 ? 'pin-key-action' : ''}`}
            data-key={`pin-${k}`}
            onClick={() => press(k)}
          >
            {k === 'back' ? '⌫' : k === 'cancel' ? 'Volver' : k}
          </button>
        ))}
      </div>
    </main>
  );
}

/** Mensaje amigable para errores de PIN de la API. */
export function pinErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_PIN') {
      const left = Number(err.details.attemptsLeft);
      return `PIN incorrecto${Number.isFinite(left) ? ` · quedan ${left} intento${left === 1 ? '' : 's'}` : ''}`;
    }
    if (err.code === 'PIN_LOCKED') return err.message;
    return err.message;
  }
  return 'No se pudo verificar el PIN';
}

/** Login de un perfil con su PIN. */
export function PinLogin({
  profile,
  onDone,
  onCancel,
}: {
  profile: Profile;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <PinPad
      profile={profile}
      title={`PIN de ${profile.name}`}
      onCancel={onCancel}
      onSubmit={async (pin) => {
        try {
          saveSession(await api.login(profile.id, pin, deviceId()));
          onDone();
          return null;
        } catch (err) {
          return pinErrorMessage(err);
        }
      }}
    />
  );
}

/** #/profile: menú del perfil activo (cambiar perfil, cambiar PIN, servidor). */
export function ProfileScreen({ onSwitch }: { onSwitch: () => void }) {
  const session = getSession();
  const [step, setStep] = useState<null | 'current' | 'new' | 'confirm'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pins = useRef({ current: '', next: '' });
  const [subSize, setSubSize] = useState(getSubtitleSize);

  useEffect(() => {
    if (!step) focusInitial();
  }, [step]);
  if (!session) return null;
  const profile = session.profile;

  if (step) {
    const titles = { current: 'PIN actual', new: 'PIN nuevo', confirm: 'Repetí el PIN nuevo' };
    return (
      <PinPad
        key={step}
        profile={profile}
        title={titles[step]}
        onCancel={() => setStep(null)}
        onSubmit={async (pin) => {
          if (step === 'current') {
            pins.current.current = pin;
            setStep('new');
            return null;
          }
          if (step === 'new') {
            if (pin === pins.current.current) return 'Tiene que ser distinto del actual';
            pins.current.next = pin;
            setStep('confirm');
            return null;
          }
          if (pin !== pins.current.next) {
            setStep('new');
            return null;
          }
          try {
            await api.changePin(profile.id, pins.current.current, pin, deviceId());
            // Cambiar el PIN cierra las sesiones: se vuelve a entrar con el nuevo.
            saveSession(await api.login(profile.id, pin, deviceId()));
            setNotice('PIN cambiado');
            setStep(null);
            return null;
          } catch (err) {
            setStep('current');
            return pinErrorMessage(err);
          }
        }}
      />
    );
  }

  return (
    <main class="center column profiles">
      <Avatar profile={profile} />
      <h1 class="page-title">{profile.name}</h1>
      {notice && <p class="pin-message">{notice}</p>}
      <div class="actions column-actions">
        <button
          class="focusable btn btn-primary"
          data-key="switch"
          data-autofocus
          onClick={onSwitch}
        >
          Cambiar de perfil
        </button>
        <button
          class="focusable btn"
          data-key="change-pin"
          onClick={() => {
            setNotice(null);
            setStep('current');
          }}
        >
          Cambiar PIN
        </button>
        <button
          class="focusable btn"
          data-key="subtitle-size"
          onClick={() => {
            const next = nextSubtitleSize(subSize);
            setSubtitleSize(next);
            setSubSize(next);
          }}
        >
          Subtítulos: {SUBTITLE_SIZE_LABEL[subSize]}
        </button>
        {canOpenSettings() && (
          <button class="focusable btn" data-key="server" onClick={openNativeSettings}>
            ⚙ Servidor
          </button>
        )}
        <button class="focusable btn" data-key="back" onClick={goBack}>
          Volver
        </button>
      </div>
    </main>
  );
}
