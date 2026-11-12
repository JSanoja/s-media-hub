#!/usr/bin/env bash
# Despliega la API de S-HUB (+ la interfaz de TV compilada) en un servidor Linux de la LAN por SSH.
# Lleva solo lo necesario para correr: package.json/lockfile, apps/api/src, apps/tv/dist. Nada de tests,
# node_modules locales ni la app Android. Las dependencias se instalan en el servidor (npm ci).
#
# Uso (desde la raíz del repo, en WSL/Linux):
#   bash apps/api/scripts/deploy-server.sh usuario@192.168.1.80 --setup      # primera vez
#   bash apps/api/scripts/deploy-server.sh usuario@192.168.1.80               # actualizar el código
#
# Opciones:
#   --setup        primera vez: instala Node 24 si falta (apt), habilita linger (servicio sin sesión
#                  abierta) y abre el puerto en ufw para la LAN. Pide la contraseña de sudo.
#   --with-db      copia la base local (CACHE_DIR/shub.db: perfiles, PINs, historial) al servidor.
#                  Hace una copia consistente con VACUUM INTO y respalda la del servidor antes de pisarla.
#   --with-thumbs  copia las miniaturas ya generadas (CACHE_DIR/thumbs).
#   --sync-media   copia la biblioteca local (MEDIA_ROOT del .env local) a REMOTE_MEDIA_ROOT (sin borrar nada).
#   --no-build     no recompila apps/tv (usa el apps/tv/dist actual).
#
# Variables (todas opcionales):
#   REMOTE_DIR=s-hub            carpeta en el servidor (relativa al home del usuario o absoluta)
#   PORT=30001                  puerto de la API en el servidor
#   PUBLIC_HOST=<host del SSH>  IP con la que la TV ve al servidor
#   REMOTE_MEDIA_ROOT=<REMOTE_DIR>/media   biblioteca en el servidor
#   LAN_CIDR=192.168.1.0/24     red a la que --setup le abre el puerto en ufw
#
# En el servidor queda:
#   <REMOTE_DIR>/app/     código (se reemplaza en cada deploy; el anterior queda en app.prev/)
#   <REMOTE_DIR>/.env     configuración (se crea la primera vez y NUNCA se pisa)
#   <REMOTE_DIR>/cache/   shub.db + miniaturas
#   servicio systemd de usuario `s-hub` → logs: journalctl --user -u s-hub -f
set -euo pipefail

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

TARGET=""
SETUP=0 WITH_DB=0 WITH_THUMBS=0 SYNC_MEDIA=0 BUILD=1
for arg in "$@"; do
  case "$arg" in
    --setup) SETUP=1 ;;
    --with-db) WITH_DB=1 ;;
    --with-thumbs) WITH_THUMBS=1 ;;
    --sync-media) SYNC_MEDIA=1 ;;
    --no-build) BUILD=0 ;;
    -h | --help) usage ;;
    -*) echo "Opción desconocida: $arg" >&2; usage 1 ;;
    *) TARGET="$arg" ;;
  esac
done
[ -n "$TARGET" ] || { echo "Falta el destino SSH (ej. usuario@192.168.1.80)" >&2; usage 1; }

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
API="$ROOT/apps/api"
SERVER_HOST="${TARGET#*@}"
REMOTE_DIR="${REMOTE_DIR:-s-hub}"
PORT="${PORT:-30001}"
PUBLIC_HOST="${PUBLIC_HOST:-$SERVER_HOST}"
LAN_CIDR="${LAN_CIDR:-192.168.1.0/24}"

# Una sola conexión SSH reutilizada (pide la contraseña/llave una sola vez).
CM_DIR="$(mktemp -d)"
STAGE="$(mktemp -d)"
cleanup() {
  ssh -o ControlPath="$CM_DIR/cm" -O exit "$TARGET" 2>/dev/null || true
  rm -rf "$CM_DIR" "$STAGE"
}
trap cleanup EXIT
SSH_OPTS=(-o ControlMaster=auto -o ControlPath="$CM_DIR/cm" -o ControlPersist=120)
rsh() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

# Rutas locales efectivas (mismo criterio que src/config.js: relativas a apps/api).
# Una ruta por línea: pueden tener espacios (ej. "/mnt/d/AI - FOLDER/...").
{
  read -r LOCAL_CACHE
  read -r LOCAL_MEDIA
} < <(cd "$API" && node -e '
  const path = require("node:path");
  try { process.loadEnvFile(".env"); } catch {}
  const r = (v, d) => path.resolve(v || d);
  console.log(r(process.env.CACHE_DIR, "../../cache") + "\n" + r(process.env.MEDIA_ROOT, "public/source"));
')

echo "==> Conectando a $TARGET"
rsh true
REMOTE_HOME="$(rsh 'printf %s "$HOME"')"
case "$REMOTE_DIR" in /*) ;; *) REMOTE_DIR="$REMOTE_HOME/$REMOTE_DIR" ;; esac
REMOTE_MEDIA_ROOT="${REMOTE_MEDIA_ROOT:-$REMOTE_DIR/media}"
echo "    Destino: $REMOTE_DIR"

# ---------------------------------------------------------------- setup (sudo)
if [ "$SETUP" = 1 ]; then
  echo "==> Setup del servidor (puede pedir la contraseña de sudo)"
  # El script va como argumento (no por stdin) para que ssh -t tenga terminal y sudo pueda pedir la contraseña.
  SETUP_SCRIPT="$(
    cat <<'EOF'
set -euo pipefail
sudo -v
need_node=1
if command -v node >/dev/null; then
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' && need_node=0
fi
if [ "$need_node" = 1 ]; then
  if command -v apt-get >/dev/null; then
    echo "    Instalando Node 24 (NodeSource)"
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "✖ Falta Node >= 22.13 y no hay apt-get: instalalo a mano y volvé a correr --setup" >&2
    exit 1
  fi
fi
echo "    Node $(node -v)"
sudo loginctl enable-linger "$USER" && echo "    linger habilitado (el servicio arranca con el servidor)"
if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow from "$LAN_CIDR" to any port "$PORT" proto tcp
  echo "    ufw: puerto $PORT abierto para $LAN_CIDR"
fi
EOF
  )"
  SETUP_B64="$(printf '%s' "$SETUP_SCRIPT" | base64 -w0)"
  ssh -t "${SSH_OPTS[@]}" "$TARGET" \
    "PORT='$PORT' LAN_CIDR='$LAN_CIDR' bash -c \"\$(echo $SETUP_B64 | base64 -d)\""
fi

# ---------------------------------------------------------------- build + empaquetado
if [ "$BUILD" = 1 ]; then
  echo "==> Compilando la interfaz de TV"
  (cd "$ROOT" && npm run build --silent)
fi
[ -f "$ROOT/apps/tv/dist/index.html" ] || { echo "✖ Falta apps/tv/dist (corré sin --no-build)" >&2; exit 1; }

echo "==> Empaquetando"
(
  cd "$ROOT"
  tar -czf "$STAGE/app.tgz" \
    package.json package-lock.json \
    apps/api/package.json apps/api/src apps/api/scripts \
    apps/tv/package.json apps/tv/dist \
    packages/shared
)
DEPS_HASH="$(cd "$ROOT" && cat package-lock.json apps/api/package.json | sha256sum | cut -c1-16)"
echo "    $(du -h "$STAGE/app.tgz" | cut -f1)"

# ---------------------------------------------------------------- subir e instalar
echo "==> Subiendo el código"
rsh "mkdir -p '$REMOTE_DIR/cache' '$REMOTE_MEDIA_ROOT' && rm -rf '$REMOTE_DIR/app.new' && mkdir '$REMOTE_DIR/app.new'"
rsh "tar -xzf - -C '$REMOTE_DIR/app.new'" <"$STAGE/app.tgz"

rsh "REMOTE_DIR='$REMOTE_DIR' DEPS_HASH='$DEPS_HASH' PORT='$PORT' PUBLIC_HOST='$PUBLIC_HOST' \
     REMOTE_MEDIA_ROOT='$REMOTE_MEDIA_ROOT' bash -s" <<'EOF'
set -euo pipefail
cd "$REMOTE_DIR"
command -v node >/dev/null || { echo "✖ No hay Node en el servidor: corré con --setup" >&2; exit 1; }

# Reusar node_modules si las dependencias no cambiaron (evita bajar ffmpeg en cada deploy).
if [ -d app/node_modules ] && [ "$(cat app/.deps-hash 2>/dev/null)" = "$DEPS_HASH" ]; then
  mv app/node_modules app.new/node_modules
  [ -d app/apps/api/node_modules ] && mv app/apps/api/node_modules app.new/apps/api/node_modules
  echo "    Dependencias sin cambios"
else
  echo "    Instalando dependencias (npm ci, solo producción)"
  (cd app.new && npm ci --omit=dev --workspace @s-hub/api --no-audit --no-fund --loglevel=error)
fi
echo "$DEPS_HASH" >app.new/.deps-hash
rm -rf app.prev
[ -d app ] && mv app app.prev
mv app.new app

# .env: se crea una sola vez; después se edita a mano en el servidor.
if [ ! -f .env ]; then
  cat >.env <<ENV
# S-HUB API en el servidor. Creado por deploy-server.sh; el deploy no lo vuelve a pisar.
PROTOCOL=http
HOST=0.0.0.0
PORT=$PORT
PUBLIC_HOST=$PUBLIC_HOST
MEDIA_ROOT=$REMOTE_MEDIA_ROOT
CACHE_DIR=$REMOTE_DIR/cache
TV_DIR=$REMOTE_DIR/app/apps/tv/dist
CAST_RECEIVER_APP_ID=CC1AD845
CORS_ORIGINS=*
LOG_FORMAT=dev
ENV
  echo "    .env creado ($REMOTE_DIR/.env)"
fi

# Servicio systemd de usuario (no necesita sudo para reiniciarse).
mkdir -p ~/.config/systemd/user
cat >~/.config/systemd/user/s-hub.service <<UNIT
[Unit]
Description=S-HUB API
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$REMOTE_DIR/app/apps/api
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning --env-file=$REMOTE_DIR/.env src/server.js
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable s-hub >/dev/null 2>&1
EOF

# ---------------------------------------------------------------- base de datos / miniaturas / biblioteca
if [ "$WITH_DB" = 1 ]; then
  [ -f "$LOCAL_CACHE/shub.db" ] || { echo "✖ No existe $LOCAL_CACHE/shub.db" >&2; exit 1; }
  echo "==> Copiando la base de datos"
  # Copia consistente aunque la API local esté corriendo (incluye lo que está en el WAL).
  node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1]);
    db.exec(`VACUUM INTO '\''${process.argv[2].replaceAll("'\''", "'\'''\''")}'\''`);
    db.close();
  ' "$LOCAL_CACHE/shub.db" "$STAGE/shub.db"
  rsh "systemctl --user stop s-hub 2>/dev/null || true
       cd '$REMOTE_DIR/cache'
       if [ -f shub.db ]; then
         bak=shub.db.bak-\$(date +%Y%m%d-%H%M%S); cp shub.db \"\$bak\"; echo \"    Respaldo de la base del servidor: cache/\$bak\"
       fi
       rm -f shub.db-wal shub.db-shm"
  rsh "cat >'$REMOTE_DIR/cache/shub.db'" <"$STAGE/shub.db"
  echo "    $(du -h "$STAGE/shub.db" | cut -f1) copiados"
fi

if [ "$WITH_THUMBS" = 1 ] && [ -d "$LOCAL_CACHE/thumbs" ]; then
  echo "==> Copiando miniaturas"
  rsync -a --info=stats1 -e "ssh ${SSH_OPTS[*]}" "$LOCAL_CACHE/thumbs/" "$TARGET:$REMOTE_DIR/cache/thumbs/"
fi

if [ "$SYNC_MEDIA" = 1 ]; then
  echo "==> Copiando la biblioteca $LOCAL_MEDIA → $REMOTE_MEDIA_ROOT (puede tardar)"
  rsync -a --info=progress2 -e "ssh ${SSH_OPTS[*]}" "$LOCAL_MEDIA/" "$TARGET:$REMOTE_MEDIA_ROOT/"
fi

# ---------------------------------------------------------------- arranque + verificación
echo "==> Reiniciando el servicio"
rsh "systemctl --user restart s-hub"
URL="http://$PUBLIC_HOST:$(rsh "grep -E '^PORT=' '$REMOTE_DIR/.env' | cut -d= -f2" || echo "$PORT")"
for _ in $(seq 1 15); do
  if curl -fsS --max-time 2 "$URL/api/health" >/dev/null 2>&1; then
    echo "Listo: $URL/tv/"
    echo "Logs:  ssh $TARGET journalctl --user -u s-hub -f"
    exit 0
  fi
  sleep 1
done
echo "✖ La API no responde en $URL/api/health. Últimos logs:" >&2
rsh "journalctl --user -u s-hub -n 30 --no-pager" >&2 || true
exit 1
