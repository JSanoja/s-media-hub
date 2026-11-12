# WU-17 · Ajustes de la app persistentes

**Fase:** 3 · App · **Tamaño:** S · **Depende de:** WU-12 · **Pedido de Juan 2026-10-22:** App #1.

## Situación actual
La URL del servidor **ya se guarda** en el almacenamiento de la app (SharedPreferences) cuando se cambia con "⚙ Servidor"/"Cambiar servidor", y sobrevive a reinicios y a `adb install -r`. Se pierde solo si se desinstala la app o se borran sus datos. → Verificar con Juan si vio que se perdiera (posible bug).

## Objetivo
Una pantalla **Ajustes** (dentro de la interfaz de TV) con todas las preferencias, guardadas en el dispositivo:
- Servidor (URL) — editar y probar conexión (`/api/health`).
- Subtítulos: activados por defecto, idioma preferido (es/en/…), tamaño.
- Reproducción automática del siguiente episodio — sí/no.
- Nombre del dispositivo (WU-19), versión de la app y de la API.

## Diseño
- Fuente de verdad en el dispositivo: **SharedPreferences** (nativo), expuestas a la web por el puente `SHubPlayer.getSettings()/setSettings(json)`; en navegador (sin app) → `localStorage`.
- El reproductor nativo lee idioma/tamaño de subtítulos y autoplay desde las mismas preferencias.
- Botón "⚙" en Inicio abre la pantalla de Ajustes (reemplaza el diálogo actual).

## Criterios de aceptación
- [ ] Cambio servidor/idioma de subtítulos → reinicio la app y la TV → siguen iguales.
