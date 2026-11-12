# WU-11 · Front nuevo: interfaz web para TV (10-foot UI)

**Fase:** 3 · Front · **Tamaño:** L · **Depende de:** WU-05 · **Decisión 2026-10-21:** el front nuevo es una **app en el Chromecast with Google TV 4K** (opción B), no un sender de Cast.

## Objetivo
Interfaz que se ve en la TV y se maneja **solo con el control remoto** (D-pad: ↑ ↓ ← → OK, Atrás). Es una web servida por la API en `/tv/`, que la app Android TV (WU-12) carga en un WebView. Mientras tanto se prueba en cualquier navegador con las flechas del teclado.

## Stack
- **Vite + TypeScript + Preact** (API tipo React, ~4 KB: liviano para el CPU del Chromecast).
- Navegación espacial propia (foco por filas/grilla, sin librerías).
- Contrato desde `packages/shared` (`/api/v1`). URL de la API: misma origen (la sirve la API) o `?api=` para desarrollo.
- Build en `apps/tv/dist`, servido por la API en `/tv/` (redirección `/` → `/tv/` cuando se retire el front viejo, WU-15).

## Pantallas
1. **Inicio**: filas horizontales ("Seguir viendo" (WU-09), "Películas", "Series", carpetas) con pósters.
2. **Detalle** (película/serie): póster, título, año, botón Reproducir/Continuar, temporadas → episodios con miniatura y progreso.
3. **Reproductor**:
   - dentro de la app Android TV → se delega al reproductor nativo (puente JS `SHubPlayer.play(json)`, WU-12);
   - en navegador → `<video>` HTML5 con controles para TV y subtítulos VTT (fallback / desarrollo).
4. Estados: cargando, vacío, error de red (con "Reintentar").

## Tareas
- [x] Scaffold `apps/tv` (Vite + Preact + TS), scripts `dev`/`build`, proxy a la API en dev.
- [x] Cliente API tipado (`/api/v1/config`, `library`, `items`, `next`).
- [x] Focus manager: D-pad, scroll automático al elemento enfocado, foco visible grande, tecla Atrás (`Backspace`/`Escape`/`GoBack` 4) = volver.
- [x] Pantallas Inicio, Carpeta/Serie/Temporada, Detalle.
- [x] Reproductor web de fallback (`<video>` + VTT) y puente al nativo si `window.SHubPlayer` existe.
- [x] API: servir `apps/tv/dist` en `/tv/` (con fallback SPA).
- [x] Diseño oscuro tipo plataforma de streaming, tipografía grande, safe area de TV (márgenes ~5 %).

## Criterios de aceptación
- [ ] Con solo flechas + Enter + Atrás se llega de Inicio a reproducir la película y se vuelve.
- [ ] Carga fluida en el Chromecast (primer render < 2 s en LAN).

> **Estado 2026-10-21:** 🟡 v1 hecha.
> - `apps/tv`: Vite 8 + Preact 11 + TypeScript 5.9. Build 25 KB JS (10 KB gzip) + 4,5 KB CSS.
> - Pantallas: Inicio (filas Películas/Series/Carpetas/Videos), Carpeta/Serie/Temporada, Detalle, Reproductor web de fallback (±10 s, pausa, subtítulos VTT, autoplay del siguiente). Puente `window.SHubPlayer.play(json)` para el reproductor nativo de WU-12.
> - Navegación espacial con flechas, foco recordado por ruta al volver, Atrás = Escape/Backspace/GoBack.
> - API sirve el build en `/tv/` (`TV_DIR`, default `../tv/dist`); si no está compilado responde 503 `TV_NOT_BUILT`.
> - Probado en Chromium headless 960×540 @2x (equivalente al WebView de la TV): Inicio → Detalle → Atrás (foco restaurado) → Serie → Temporada → Episodio → Reproductor → Atrás.
> - Falta: probar en el Chromecast real (con la app de WU-12), "Seguir viendo" (WU-09).
