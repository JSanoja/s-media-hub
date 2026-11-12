#!/usr/bin/env bash
# Prepara WSL (Ubuntu/Debian) para compilar la app Android TV de S-HUB, sin Android Studio.
# Instala: JDK 17, Android SDK (cmdline-tools, platform-tools, platform 35, build-tools 35) y Gradle 8.11.1.
# Uso: bash apps/android-tv/scripts/setup-wsl.sh
set -euo pipefail

SDK="${ANDROID_HOME:-$HOME/android-sdk}"
GRADLE_VERSION=8.11.1
GRADLE_HOME="$HOME/.local/share/gradle-$GRADLE_VERSION"
CMDLINE_ZIP=commandlinetools-linux-11076708_latest.zip
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Paquetes del sistema (JDK 17, unzip, curl)"
sudo apt-get update -qq
sudo apt-get install -y -qq openjdk-17-jdk-headless unzip curl >/dev/null
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
java -version 2>&1 | head -1

echo "==> Android SDK en $SDK"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$SDK/cmdline-tools"
  tmp="$(mktemp -d)"
  curl -fsSL "https://dl.google.com/android/repository/$CMDLINE_ZIP" -o "$tmp/cmdline.zip"
  unzip -q "$tmp/cmdline.zip" -d "$tmp"
  rm -rf "$SDK/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -rf "$tmp"
fi
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMANAGER" --sdk_root="$SDK" --licenses >/dev/null || true
"$SDKMANAGER" --sdk_root="$SDK" "platform-tools" "platforms;android-35" "build-tools;35.0.0" >/dev/null
echo "    OK: $(ls "$SDK/platforms")"

echo "==> Gradle $GRADLE_VERSION"
if [ ! -x "$GRADLE_HOME/bin/gradle" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip" -o "$tmp/gradle.zip"
  mkdir -p "$(dirname "$GRADLE_HOME")"
  unzip -q "$tmp/gradle.zip" -d "$(dirname "$GRADLE_HOME")"
  rm -rf "$tmp"
fi

echo "==> local.properties y Gradle wrapper del proyecto"
echo "sdk.dir=$SDK" > "$HERE/local.properties"
(cd "$HERE" && "$GRADLE_HOME/bin/gradle" -q wrapper --gradle-version "$GRADLE_VERSION")

PROFILE_LINE="export ANDROID_HOME=\"$SDK\"; export JAVA_HOME=\"$JAVA_HOME\"; export PATH=\"\$ANDROID_HOME/platform-tools:\$PATH\""
grep -qF "ANDROID_HOME=\"$SDK\"" "$HOME/.bashrc" || echo "$PROFILE_LINE" >> "$HOME/.bashrc"

echo
echo "Listo. Abrí una terminal nueva (o: source ~/.bashrc) y compilá/instalá con:"
echo "  bash apps/android-tv/scripts/deploy.sh 192.168.1.3:<puerto-de-depuración>"
