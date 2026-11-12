# WU-14 · Ejecutar la API como servicio en la PC

**Fase:** 4 · Ops · **Tamaño:** S · **Depende de:** WU-07

## Objetivo
Que S-HUB esté siempre disponible cuando prendés la TV, sin abrir una consola.

## Tareas
- [ ] Elegir modo:
  - **Servicio de Windows** con NSSM o `node-windows` (recomendado si la biblioteca está en `D:\`).
  - **Docker** (Docker Desktop) con `MEDIA_ROOT` montado read-only — más portable, algo más de overhead en Windows.
  - PM2 + `pm2-windows-startup`.
- [ ] Arranque automático al iniciar Windows; reinicio ante caídas.
- [ ] Caddy (si se eligió en WU-07) también como servicio.
- [ ] Logs rotados en `CACHE_DIR/logs`.
- [ ] Evitar que la PC se suspenda mientras hay reproducción (o documentar el plan de energía).
- [ ] Script `npm run build && npm run start:prod` documentado.

## Criterios de aceptación
- [ ] Reiniciar la PC → sin hacer nada, se puede castear desde el celular.

> **Decisión 2026-10-22:** el destino es un **servidor Linux local** con la API **en Docker** (todas las dependencias —Node 24, ffmpeg— dentro de la imagen).
> - `Dockerfile` multi-stage: build de `apps/tv` + API con `node:24-slim` y `ffmpeg` del sistema (`FFMPEG_PATH=/usr/bin/ffmpeg`).
> - `docker-compose.yml`: puerto 30001, volúmenes `MEDIA_ROOT` (solo lectura) y `CACHE_DIR` (thumbs + `shub.db`), `.env` del host, `restart: unless-stopped`, healthcheck a `/api/health`.
> - En el servidor: `PUBLIC_HOST` = IP fija del servidor; la app de la TV solo cambia la URL desde Ajustes.
