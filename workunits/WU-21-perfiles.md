# WU-21 · Perfiles con PIN (Obi, Papas, Invitados)

**Fase:** 2 · API + Front · **Tamaño:** M · **Depende de:** base SQLite (WU-06 parte 1) · **Pedido de Juan 2026-10-22.**

## Objetivo
Tres perfiles para la app de la TV, cada uno con su PIN y su propio historial ("Seguir viendo", vistos ✓, ajustes de subtítulos):

| Perfil | PIN por defecto | Color |
|---|---|---|
| **Obi** | 7890 | naranja (acento) |
| **Papas** | 5555 | verde |
| **Invitados** | 1111 | gris azulado |

## Alcance de la "seguridad"
El PIN es un **candado de comodidad** dentro de la casa (la API corre por HTTP en la LAN), no una protección fuerte. Aun así:
- PINs guardados **hasheados** (scrypt de `node:crypto` con sal), nunca en texto plano; los defaults se siembran en el primer arranque.
- Límite de intentos: 5 fallidos → bloqueo de 60 s por perfil y dispositivo.
- Los PINs por defecto se pueden cambiar (ver "Cambiar PIN"); `.env` permite otros defaults de siembra (`PROFILE_PINS=obi:7890,papas:5555,invitados:1111`).

## Modelo (SQLite, `node:sqlite`)
- `profiles(id, name, color, pin_hash, pin_salt, sort, created_at)`
- `profile_sessions(token PK, profile_id, device_id, created_at, last_used_at)` — token aleatorio de 32 bytes, sin vencimiento (se revoca al cerrar sesión o cambiar PIN).
- `watch_state`, `subtitle_offset` (WU-09/WU-18) pasan a tener `profile_id`.

## API
- `GET /api/v1/profiles` → `[{ id, name, color }]` (sin PIN).
- `POST /api/v1/profiles/:id/session` `{ pin, deviceId }` → `{ token, profile }` · 401 si el PIN es incorrecto · 429 si está bloqueado.
- `DELETE /api/v1/profiles/session` (header) → cerrar sesión.
- `PUT /api/v1/profiles/:id/pin` `{ currentPin, newPin }` (4 dígitos) → cambia el PIN y revoca sesiones.
- Header `X-Profile-Token` en todos los endpoints de historial/progreso; sin token válido → 401.
- La biblioteca y el streaming **no** requieren perfil (los usa la app antes de elegir, y el reproductor nativo).

## Front (TV)
- Al abrir: pantalla **"¿Quién está viendo?"** con los 3 perfiles (navegable con el D-pad).
- Al elegir: teclado numérico en pantalla (grilla 3×4 navegable con flechas + OK) y también las teclas numéricas del control si las tiene; 4 dígitos → entra automáticamente.
- El token se guarda en el dispositivo (WU-17: SharedPreferences en la app, `localStorage` en navegador) → al volver a abrir entra directo al último perfil.
- En Inicio: avatar del perfil arriba a la derecha → **"Cambiar perfil"** / **"Cambiar PIN"** / **"Cerrar sesión"**.
- El reproductor nativo recibe el token para reportar progreso.

## Criterios de aceptación
- [ ] Abro la app → elijo "Papas" → PIN 5555 → entro; "Seguir viendo" muestra solo lo de Papas.
- [ ] PIN incorrecto 5 veces → mensaje de espera de 60 s.
- [ ] Cierro y abro la app → entra directo al último perfil.
- [ ] Cambio el PIN de Obi → el viejo deja de funcionar.

> **Estado 2026-10-22:** ✅ API + interfaz; falta probar en la TV.
> - Base: `src/services/db.js` (node:sqlite, WAL, migraciones con `PRAGMA user_version`) → `CACHE_DIR/shub.db`. Scripts con `--disable-warning=ExperimentalWarning`.
> - API: `/api/v1/profiles` (lista), `POST /:id/session`, `GET /me`, `DELETE /session`, `PUT /:id/pin`. Token aleatorio (solo se guarda su SHA-256), PIN con scrypt+sal, bloqueo 5 intentos/60 s por perfil y dispositivo, la siembra no pisa PINs cambiados. `PROFILE_PINS` en `.env` para otros defaults. 12 tests nuevos (77 en total).
> - Interfaz: "¿Quién está viendo?", teclado PIN 3×4 (flechas+OK o números del control), sesión guardada (entra directo al reabrir), chip del perfil en Inicio → `#/profile` con Cambiar de perfil / Cambiar PIN / Servidor. Atrás en el PIN vuelve a los perfiles (entrada de historial propia).
> - Probado en Chromium: picker → PIN incorrecto ("quedan 4 intentos") → volver → PIN correcto con el teclado en pantalla → recarga mantiene sesión → cambiar PIN → el viejo falla y el nuevo entra.
> - El reproductor nativo todavía no envía el token (lo necesita WU-09 para guardar progreso).
