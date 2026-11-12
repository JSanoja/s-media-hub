# android-tv — app S-HUB para Chromecast with Google TV

App Android TV (Kotlin) que carga la interfaz web de `apps/tv` (servida por la API en `/tv/`) en un WebView y reproduce con **Media3/ExoPlayer** nativo (MKV, MP4, HEVC, AC3/EAC3 passthrough, subtítulos VTT). Aparece en el menú de apps de la TV (launcher Leanback). Ver `workunits/WU-12-android-tv-app.md`.

## Requisitos (una sola vez, en WSL)

```bash
bash apps/android-tv/scripts/setup-wsl.sh   # JDK 17 + Android SDK + Gradle 8.11.1 + gradlew
source ~/.bashrc
```

## Compilar e instalar

1. En la TV: Opciones para desarrolladores → **Depuración inalámbrica** activada; anotá IP:puerto.
2. La API corriendo con la interfaz compilada (`npm run build && npm run dev` en la raíz).
3. ```bash
   bash apps/android-tv/scripts/deploy.sh 192.168.1.3:<puerto>
   ```

La URL del servidor por defecto es `http://192.168.1.5:30001` (`gradle.properties` → `shub.serverUrl`, o `SERVER_URL=... deploy.sh`). Dentro de la app se puede cambiar: si no conecta aparece "Cambiar servidor" (y la tecla MENU, si el control la tiene).

## Control remoto

- Interfaz: flechas para moverse, OK para elegir, Atrás para volver.
- Reproductor: OK = play/pausa · ←/→ = −10 s / +10 s · ↑/↓ = controles (subtítulos, pistas) · Atrás = salir. Al terminar pasa al siguiente episodio.

## Versiones

AGP 8.7.3 · Kotlin 2.0.21 · Gradle 8.11.1 · compile/target SDK 35 · minSdk 26 · Media3 1.5.1 · JDK 17.
