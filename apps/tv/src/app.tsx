import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from './lib/api';
import { sendHeartbeat, startHeartbeat } from './lib/devices';
import { navigate, useRoute } from './lib/router';
import { clearSession, getSession, saveSession, type Profile } from './lib/session';
import { ErrorView, Loading } from './screens/common';
import { Detail } from './screens/Detail';
import { FolderScreen } from './screens/FolderScreen';
import { Home } from './screens/Home';
import { Player } from './screens/Player';
import { PinLogin, ProfilePicker, ProfileScreen } from './screens/Profiles';

type Gate =
  | { state: 'checking' }
  | { state: 'picker' }
  | { state: 'pin'; profile: Profile }
  | { state: 'error'; error: Error }
  | { state: 'ready' };

/** Antes de la biblioteca: validar la sesión guardada o pedir perfil + PIN (WU-21). */
export function App() {
  const [gate, setGate] = useState<Gate>({ state: 'checking' });

  const check = () => {
    const session = getSession();
    if (!session) return setGate({ state: 'picker' });
    setGate({ state: 'checking' });
    api
      .me()
      .then((profile) => {
        saveSession({ ...session, profile });
        setGate({ state: 'ready' });
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          setGate({ state: 'picker' });
        } else setGate({ state: 'error', error });
      });
  };
  useEffect(check, []);
  useEffect(startHeartbeat, []);
  // Al entrar o cambiar de perfil, el servidor lo ve enseguida.
  useEffect(() => {
    if (gate.state === 'ready' || gate.state === 'picker') sendHeartbeat();
  }, [gate.state]);

  // El PIN se pide en una entrada de historial propia: "Atrás" (también el del control) vuelve.
  useEffect(() => {
    if (gate.state !== 'pin') return;
    history.pushState({ pin: true }, '', '#/pin');
    const onPop = () => setGate({ state: 'picker' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [gate.state]);

  const switchProfile = async () => {
    await api.logout().catch(() => {});
    clearSession();
    navigate({ name: 'home' }, { replace: true });
    setGate({ state: 'picker' });
  };

  switch (gate.state) {
    case 'checking':
      return <Loading />;
    case 'error':
      return <ErrorView error={gate.error} onRetry={check} />;
    case 'picker':
      return <ProfilePicker onPick={(profile) => setGate({ state: 'pin', profile })} />;
    case 'pin':
      return (
        <PinLogin
          profile={gate.profile}
          onCancel={() => history.back()}
          onDone={() => {
            history.replaceState(null, '', '#/');
            setGate({ state: 'ready' });
          }}
        />
      );
    default:
      return <Routes onSwitch={switchProfile} />;
  }
}

function Routes({ onSwitch }: { onSwitch: () => void }) {
  const route = useRoute();
  switch (route.name) {
    case 'folder':
      return <FolderScreen key={route.id} id={route.id} />;
    case 'item':
      return <Detail key={route.id} id={route.id} />;
    case 'play':
      return <Player key={route.id} id={route.id} start={route.start} />;
    case 'profile':
      return <ProfileScreen onSwitch={onSwitch} />;
    default:
      return <Home />;
  }
}
