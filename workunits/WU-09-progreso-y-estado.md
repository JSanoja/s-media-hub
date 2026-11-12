# WU-09 · Historial: "Seguir viendo", vistos y retomar

**Fase:** 2 · API + App · **Tamaño:** M · **Depende de:** base SQLite (WU-06, parte 1), **WU-21 (perfiles)** · **Pedidos de Juan 2026-10-22:** App #2 (identificar lo ya visto) y App #3 (continuar viendo).

## Objetivo
Que S-HUB recuerde qué viste: retomar un video donde lo dejaste, una fila **"Seguir viendo"**, y que lo que ya terminaste quede **marcado como visto (✓)**. **Lo visto NO se oculta ni se mueve** (decisión de Juan 2026-10-22): sigue en su lugar, solo identificado.

## Modelo (SQLite en `CACHE_DIR/shub.db`, `node:sqlite`)
`watch_state(profile_id, item_id, position_sec, duration_sec, status: 'in_progress'|'watched', updated_at, device_id)` — PK `(profile_id, item_id)`
- `in_progress`: entre 5 % y 90 % (y más de 60 s vistos).
- `watched`: superó el 90 % o llegó a `ENDED`.
- **Por perfil** (WU-21: Obi, Papas, Invitados): cada uno tiene su "Seguir viendo" y sus vistos. Todos los endpoints de esta sección requieren `X-Profile-Token`. `device_id` (WU-19) queda registrado para saber desde dónde se vio.

## API
- `PUT /api/v1/items/:id/progress` `{ positionSec, durationSec, deviceId }` → calcula el estado.
- `POST /api/v1/items/:id/watched` · `DELETE /api/v1/items/:id/watched` (marcar / desmarcar).
- `GET /api/v1/continue-watching` → items `in_progress`, más recientes primero (máx. 20).
- Todo `Item` incluye `progress: { positionSec, durationSec, status, updatedAt } | null`.
- Carpetas/temporadas incluyen `watchedCount` / `videoCount` para mostrar "3/10 vistos" o ✓ si están completas.

## App / Interfaz
- **Reproductor nativo:** reporta progreso cada 15 s, al pausar y al salir (ya devuelve posición; falta el `PUT`). Al abrir un item con progreso, arranca en esa posición.
- **Detalle:** si hay progreso → botones **"▶ Continuar (32:10)"** y **"Desde el principio"**; si está visto → **"Volver a ver"** + **"Marcar como no visto"**.
- **Inicio:** fila **"Seguir viendo"** primero.
- **Tarjetas:** barra de progreso si está a medias; **check ✓ ("Visto")** y póster levemente atenuado si ya se vio. Nada se oculta.
- **Temporadas/series:** indicador "3/10 vistos" o ✓ si están completas.

## Criterios de aceptación
- [ ] Corto una película a la mitad → aparece en "Seguir viendo" y "Continuar" arranca en ese punto.
- [ ] Termino un episodio → sigue en su lugar con ✓ "Visto"; "Marcar como no visto" le saca el check.
- [ ] Sobrevive a reiniciar la API y la app.

> **Estado 2026-10-22:** ✅ hecho; falta recompilar el APK y probar en la TV.
> - Base: migración 2 `watch_state(profile_id, item_id, position_sec, duration_sec, watched, watched_at, device_id, updated_at)`.
> - Reglas: ≥ 90 % o `ended` → ✓ visto y posición 0 (la próxima arranca de nuevo); el ✓ solo se quita a mano. "Seguir viendo" = posición ≥ 30 s, más reciente primero (incluye algo visto que se está re-viendo). Nada se oculta.
> - API: `PUT /items/:id/progress`, `POST|DELETE /items/:id/watched`, `GET /continue-watching`; `progress` en items (library, item, next) y `watchedCount` en carpetas (la serie suma todas sus temporadas) cuando viene `X-Profile-Token`. 11 tests nuevos (88 en total).
> - Interfaz: fila "Seguir viendo" (retoma directo), barra de progreso y ✓ en tarjetas (atenuadas), "3/10 vistos" en series/temporadas, detalle con Continuar (mm:ss) / Desde el principio / Volver a ver / Marcar como (no) visto. Reproductor web reporta cada 15 s, al pausar, al salir y al terminar.
> - App nativa (v0.2.0): recibe `profileToken` y `deviceId`, reporta cada 15 s, al pausar, al salir y al terminar (antes del autoplay del siguiente).
