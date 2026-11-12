#!/usr/bin/env bash
# Compila la app Android TV de S-HUB y la instala en el Chromecast por ADB.
# Uso: bash apps/android-tv/scripts/deploy.sh [IP:PUERTO]   (default: el dispositivo ADB ya conectado)
#      SERVER_URL=http://192.168.1.5:30001 bash .../deploy.sh 192.168.1.3:38463
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
APK="$HERE/app/build/outputs/apk/debug/app-debug.apk"
ADB="${ANDROID_HOME:+$ANDROID_HOME/platform-tools/}adb"
command -v "$ADB" >/dev/null 2>&1 || ADB=adb

echo "==> Compilando (assembleDebug)"
GRADLE_ARGS=(assembleDebug --console=plain)
[ -n "${SERVER_URL:-}" ] && GRADLE_ARGS+=("-Pshub.serverUrl=$SERVER_URL")
(cd "$HERE" && ./gradlew "${GRADLE_ARGS[@]}")
echo "    APK: $APK ($(du -h "$APK" | cut -f1))"

if [ -n "$TARGET" ]; then
  echo "==> Conectando a $TARGET"
  "$ADB" connect "$TARGET" | tail -1
  SERIAL=(-s "$TARGET")
else
  SERIAL=()
fi

echo "==> Instalando en la TV"
"$ADB" "${SERIAL[@]}" install -r "$APK"

echo "==> Abriendo S-HUB"
"$ADB" "${SERIAL[@]}" shell am start -n com.shub.tv/.MainActivity >/dev/null
echo "Listo. Logs: $ADB ${SERIAL[*]} logcat -s chromium:* ExoPlayerImpl:* AndroidRuntime:*"
