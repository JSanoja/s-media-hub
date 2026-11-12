import { render } from 'preact';
import { App } from './app';
import { installSpatialNavigation } from './lib/focus';
import './styles.css';

// Renombre js-flix → S-HUB: conservar sesión, dispositivo y preferencias guardadas.
try {
  for (const k of ['session', 'deviceId', 'subtitleSize']) {
    const old = localStorage.getItem(`jsflix.${k}`);
    if (old !== null && localStorage.getItem(`shub.${k}`) === null)
      localStorage.setItem(`shub.${k}`, old);
    localStorage.removeItem(`jsflix.${k}`);
  }
} catch {
  /* sin almacenamiento */
}

installSpatialNavigation();
render(<App />, document.getElementById('app')!);
