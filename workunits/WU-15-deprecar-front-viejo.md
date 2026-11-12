# WU-15 · Deprecar el front Angular y limpiar `public/`

**Fase:** 4 · Cierre · **Tamaño:** S · **Depende de:** WU-11, WU-12

## Tareas
- [ ] Borrar de la API el build compilado de Angular en `public/` (`main-*.js`, `polyfills-*`, `runtime-*`, `styles-*.css`, fuentes de videogular, `3rdpartylicenses.txt`, `index.html`) y los íconos viejos de `public/assets` si el sender trae los suyos.
- [ ] Eliminar el endpoint legacy `/api/browse`, `/api/thumb` y el alias `/source/*` (mantenidos por compatibilidad desde WU-02/03/05).
- [ ] Archivar el repo `JSanoja/js-brwoser` en GitHub con un README que apunte a S-HUB.
- [ ] Dejar un tag `legacy-angular` en el repo de la API antes de borrar.

## Criterios de aceptación
- [ ] La API ya no sirve nada del front viejo; el repo no contiene artefactos compilados.
