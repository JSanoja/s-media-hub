# WU-12 · App Android TV (WebView + reproductor nativo Media3)

**Fase:** 3 · Front · **Tamaño:** M · **Depende de:** WU-11 · **Dispositivo:** Chromecast with Google TV 4K (`sabrina`, Android TV 14), IP 192.168.1.3, ADB por depuración inalámbrica.

## Objetivo
App "S-HUB" que aparece en el menú de la TV (launcher Leanback), carga la interfaz de WU-11 desde la API y reproduce con **ExoPlayer/Media3** (nativo) para soportar MKV, HEVC, AC3/EAC3 y SRT sin transcodificar.

## Diseño
- Kotlin, `minSdk 26`, `targetSdk 34`, una sola `Activity` con `WebView` a pantalla completa.
- URL de la API configurable (default `http://192.168.1.5:30001/tv/`), editable en una pantalla de ajustes (mantener presionado / menú) → nada hardcodeado.
- `android:usesCleartextTraffic` / `network_security_config` permitiendo HTTP **solo** a la IP/host de la API.
- Puente JS → nativo: `SHubPlayer.play(itemJson)` abre `PlayerActivity` (Media3 `PlayerView`, subtítulos externos VTT/SRT, reanudar en `positionSec`), y al salir devuelve la posición al WebView (para WU-09).
- Tecla Atrás: primero navega dentro de la web (`history.back`), si no hay historial sale de la app.
- Banner/ícono Leanback 320×180.

## Build y deploy (en WSL o Android Studio de Windows)
- Requiere JDK 17 + Android SDK (cmdline-tools) → `./gradlew assembleDebug`.
- `adb connect 192.168.1.3:<puerto>` → `adb install -r app-debug.apk`.
- (No se puede compilar desde el entorno de Claude: Google Maven/Gradle bloqueados.)

## Tareas
- [ ] Proyecto Gradle `apps/android-tv` (Kotlin DSL, Media3).
- [ ] MainActivity + WebView (JS habilitado, cache, foco/D-pad, Atrás).
- [ ] PlayerActivity Media3 + subtítulos + reanudar + volver con posición.
- [ ] Ajustes: URL de la API.
- [ ] Ícono/banner, nombre "S-HUB".
- [ ] Script `scripts/deploy-tv.sh` (build + install por ADB).

## Criterios de aceptación
- [ ] S-HUB aparece en el menú de apps de la TV y abre la biblioteca.
- [ ] La película se reproduce con el reproductor nativo, con subtítulos, y se puede adelantar con el control.

> **Estado 2026-10-21:** 🟡 código listo, pendiente de compilar en WSL.
> - `MainActivity`: WebView a pantalla completa con `<servidor>/tv/`, Atrás = historial web y luego salir, diálogo "No se pudo conectar" con Reintentar/Cambiar servidor, tecla MENU = ajustes. Puente `SHubPlayer.play/openSettings/serverUrl/version`. Al volver del reproductor emite `shub:playback` {id, positionSec, ended} para WU-09.
> - `PlayerActivity`: Media3 1.5.1 (ExoPlayer + PlayerView), subtítulos VTT de la API (prefiere español, activa "und"), OK = pausa, ←/→ = ±10 s, autoplay de `/items/:id/next`.
> - URL del servidor: default `http://192.168.1.5:30001` (`gradle.properties` → `shub.serverUrl`), editable en la app (SharedPreferences). Cleartext permitido (LAN).
> - Interfaz web: botón "⚙ Servidor" en Inicio solo dentro de la app; fix de navegación (←/→ no salen de la fila).
> - Probado en navegador simulando el puente: "Reproducir" envía el item completo al nativo.
