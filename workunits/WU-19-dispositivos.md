# WU-19 · Registro de dispositivos activos

**Fase:** 2 · API + App · **Tamaño:** S · **Depende de:** base SQLite · **Pedidos de Juan 2026-10-22:** API #2 y API #3.

## Objetivo
Saber qué dispositivos usan S-HUB y cuáles están activos ahora (y qué están viendo).

## Modelo
`devices(id PK uuid, name, kind: 'android-tv'|'browser', model, app_version, ip, first_seen, last_seen, now_playing_item_id, now_playing_position_sec, profile_id)` — perfil activo en el dispositivo (WU-21)

## API
- `POST /api/v1/devices/heartbeat` `{ deviceId, name, kind, model, appVersion, nowPlaying?: { itemId, positionSec, paused } }` → upsert + `last_seen`; IP desde la conexión.
- `GET /api/v1/devices` → todos, con `active: lastSeen < DEVICE_ACTIVE_SECONDS` (default 120 s, configurable por env).
- `GET /api/v1/devices?active=1` → solo activos (pedido API #3).
- `DELETE /api/v1/devices/:id` → olvidar un dispositivo.
- Los endpoints de escritura aceptan el token opcional `API_TOKEN` (diferido de WU-04).

## App / Interfaz
- La app genera un `deviceId` (UUID) la primera vez y lo guarda (WU-17); nombre por defecto = modelo ("Chromecast").
- Heartbeat al abrir, cada 60 s y al cambiar de estado de reproducción (play/pausa/fin).
- En navegador: `deviceId` en `localStorage`, `kind: 'browser'`.

## Criterios de aceptación
- [ ] (falta probar en la TV) Con la app abierta en la TV, `GET /api/v1/devices?active=1` la lista con su IP 192.168.1.3 y lo que está reproduciendo; a los 2 min de cerrarla deja de estar activa.

> **Estado (2026-11-12):** ✅ implementado; falta instalar el APK y verificar en la TV.
> - API: tabla `devices` (migración 3), `services/devices.js`, `routes/devices.js`, `DEVICE_ACTIVE_SECONDS` (default 120). La IP sale de la conexión (`::ffff:` se limpia); el perfil, del header `X-Profile-Token`. `nowPlaying` se informa solo si el dispositivo está activo y trae título/temporada/episodio. 7 tests en `test/devices.test.js`.
> - Interfaz (`apps/tv/src/lib/devices.ts`): heartbeat al abrir, cada 60 s, al cambiar de perfil y en play/pausa/salida del reproductor web. En navegador el nombre es "Chrome en Windows" etc.; en la app sale del puente `SHubPlayer.deviceInfo()`.
> - App Android: `DeviceHeartbeat.kt`; el reproductor nativo manda heartbeat cada 15 s, en play/pausa y al salir (mientras está abierto, la web no manda para no pisar `nowPlaying`). En segundo plano (Home) se pausan los timers de la web y el reporte del reproductor → el dispositivo pasa a inactivo a los 2 min.
> - Diferido: token de escritura `API_TOKEN` (queda para cuando la API salga de la LAN) y una pantalla de dispositivos en la interfaz.
