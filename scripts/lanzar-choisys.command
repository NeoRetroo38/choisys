#!/usr/bin/env bash
# lanzar-choisys.command — lanza en este Mac: landing (scenarys) en "/", choisys en "/choisys" y la API en "api.<dominio>".
#
#   bash lanzar-choisys.command            modo prueba: todo en http://localhost:8080 (no toca internet)
#   bash lanzar-choisys.command online     modo online: HTTPS real en el dominio (pide confirmación)
#   bash lanzar-choisys.command estado     comprueba servicios, DNS, tráfico reciente y conexiones
#   bash lanzar-choisys.command parar      para motor, API y proxy
#
# Primera vez: chmod +x lanzar-choisys.command (iCloud no conserva el permiso de ejecución).
# Requisitos: macOS con Xcode Command Line Tools (clang, make), git, node >= 20.19, caddy y gh (GitHub CLI):
#   brew install node caddy gh      y luego      gh auth login      (con la cuenta NeoRetroo38)
# CHOISYS_API_URL=https://... cambia la dirección pública de la API (por defecto https://api.<dominio>).
# No instala nada por sí solo, no imprime secretos y no usa Funnel. El motor C++ solo escucha en 127.0.0.1.
set -euo pipefail

MODE="${1:-prueba}"
DOMAIN="${CHOISYS_DOMAIN:-neowebdevsolutions.com}"
OWNER="NeoRetroo38"
WORK="${CHOISYS_WORK:-$HOME/choisys-launch}"
ENV_FILE="${CHOISYS_ENV_FILE:-$HOME/.choisys.env.local}"   # CHOISYS_LOCAL_API_TOKEN y DATABASE_URL (permiso 600)
LOGS="$WORK/logs"; RUN="$WORK/run"; SITE="$WORK/site"
API_PORT=3000

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Falta '$1'. Instálalo con: $2"; }
env_has() { grep -qE "^$1=.{8,}" "$ENV_FILE" 2>/dev/null; }

mkdir -p "$WORK" "$LOGS" "$RUN"

stop_all() {
  for name in caddy api engine; do
    if [ -f "$RUN/$name.pid" ]; then
      kill "$(cat "$RUN/$name.pid")" 2>/dev/null && ok "parado: $name" || true
      rm -f "$RUN/$name.pid"
    fi
  done
}

status() {
  say "Estado ($(date '+%d/%m/%Y %H:%M:%S'))"
  local token; token="$(grep -E '^CHOISYS_LOCAL_API_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
  if [ -n "$token" ] && curl -fsS -m 4 -H "Authorization: Bearer $token" http://127.0.0.1:8765/health >/dev/null 2>&1; then ok "motor C++ (127.0.0.1:8765)"; else warn "motor C++ no responde"; fi
  if curl -fsS -m 4 "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then ok "API (127.0.0.1:$API_PORT)"; else warn "API no responde"; fi
  if [ -f "$RUN/mode" ] && [ "$(cat "$RUN/mode")" = "online" ]; then
    for u in "https://$DOMAIN/" "https://$DOMAIN/choisys/" "https://api.$DOMAIN/health"; do
      code="$(curl -s -o /dev/null -w '%{http_code}' -m 8 "$u" || true)"; [ "$code" = "200" ] && ok "$u → 200" || warn "$u → $code"
    done
    printf '  DNS: %s → %s | api → %s\n' "$DOMAIN" "$(dig +short "$DOMAIN" | head -1)" "$(dig +short "api.$DOMAIN" | head -1)"
    printf '  IP pública de este Mac: %s\n' "$(curl -s -m 5 https://api.ipify.org || echo '?')"
  else
    for u in "http://localhost:8080/" "http://localhost:8080/choisys/"; do
      code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$u" || true)"; [ "$code" = "200" ] && ok "$u → 200" || warn "$u → $code"
    done
  fi
  if [ -s "$LOGS/access.log" ]; then
    say "Tráfico reciente (últimas 10 peticiones)"
    tail -n 10 "$LOGS/access.log" | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.trim().split("\n")){try{const j=JSON.parse(l);
      console.log("  "+new Date(j.ts*1000).toLocaleTimeString()+"  "+j.request.method+" "+j.request.host+j.request.uri+"  → "+j.status)}catch{}}})'
    printf '  Peticiones totales registradas: %s\n' "$(wc -l < "$LOGS/access.log" | tr -d ' ')"
  fi
  say "Conexiones en directo (solo sudev): http://127.0.0.1:$API_PORT/live"
}

case "$MODE" in
  parar) stop_all; exit 0 ;;
  estado) status; exit 0 ;;
  prueba|online) ;;
  *) die "Modo desconocido: $MODE (usa prueba, online, estado o parar)" ;;
esac

say "choisys · lanzamiento ($MODE) · dominio $DOMAIN"
need git "xcode-select --install"; need make "xcode-select --install"; need node "brew install node"
need npm "brew install node"; need caddy "brew install caddy"; need gh "brew install gh"
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&(b>19||(b===19&&c>=0)))?0:1)' || die "Hace falta Node >= 20.19 (tienes $(node -v))"
gh auth status >/dev/null 2>&1 || die "Inicia sesión en GitHub con: gh auth login (cuenta $OWNER)"
ok "herramientas y sesión de GitHub"

# --- secretos: se crean/leen del archivo externo, nunca se imprimen ---
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  printf 'CHOISYS_LOCAL_API_TOKEN=%s\n' "$(openssl rand -hex 32)" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"; ok "creado $ENV_FILE con un token local aleatorio"
fi
env_has CHOISYS_LOCAL_API_TOKEN || die "Falta CHOISYS_LOCAL_API_TOKEN (32+ caracteres) en $ENV_FILE"
env_has DATABASE_URL || die "Falta DATABASE_URL en $ENV_FILE. Añade una línea DATABASE_URL=... (Neon) con tu editor; no la pegues en el chat."
chmod 600 "$ENV_FILE"
set -a; . "$ENV_FILE"; set +a

# --- repos de GitHub (si ya existen, solo se actualizan sin sobrescribir cambios) ---
fetch_repo() {
  local name="$1" dir="$WORK/$1"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" fetch -q origin
    git -C "$dir" checkout -q main
    git -C "$dir" merge -q --ff-only origin/main || die "$name tiene cambios locales que impiden actualizar; revisa $dir"
  else
    gh repo clone "$OWNER/$name" "$dir" -- -q
  fi
  ok "$name @ $(git -C "$dir" rev-parse --short HEAD)"
}
say "1/6 Repos"
fetch_repo choisys; fetch_repo neos-cube; fetch_repo scenarys

if [ "$MODE" = "online" ]; then
  APP_ORIGIN="https://$DOMAIN"; API_URL="${CHOISYS_API_URL:-https://api.$DOMAIN}"
else
  APP_ORIGIN="http://localhost:8080"; API_URL="http://localhost:8090"
fi

say "2/6 Motor C++ (solo 127.0.0.1:8765)"
stop_all
( cd "$WORK/neos-cube" && make service >/dev/null && ok "motor compilado" )
( cd "$WORK/neos-cube" && nohup ./run.sh > "$LOGS/engine.log" 2>&1 & echo $! > "$RUN/engine.pid" )

say "3/6 API de choisys"
( cd "$WORK/choisys" && npm ci --silent && npm run db:generate --workspace apps/api >/dev/null && npm run build --workspace apps/api >/dev/null )
ok "API compilada"
( cd "$WORK/choisys" && API_HOST=127.0.0.1 PORT=$API_PORT API_ALLOWED_ORIGINS="$APP_ORIGIN" nohup npm run start --workspace apps/api > "$LOGS/api.log" 2>&1 & echo $! > "$RUN/api.pid" )

say "4/6 Landing (scenarys) en /"
( cd "$WORK/scenarys" && npm ci --silent && VITE_CHOISYS_URL=/choisys npm run build:public >/dev/null )
rm -rf "$SITE"; mkdir -p "$SITE"; cp -R "$WORK/scenarys/dist/." "$SITE/"
ok "landing construida"

say "5/6 choisys (web instalable) en /choisys"
( cd "$WORK/choisys" && EXPO_BASE_URL=/choisys EXPO_PUBLIC_API_URL="$API_URL" EXPO_NO_TELEMETRY=1 npx expo export --platform web --output-dir "$WORK/app-dist" >/dev/null )
rm -rf "$SITE/choisys"; mkdir -p "$SITE/choisys"; cp -R "$WORK/app-dist/." "$SITE/choisys/"
ok "web de choisys exportada (la API es $API_URL)"
warn "Instalable como app: en Safari, Compartir → Añadir a pantalla de inicio. Una PWA completa (manifest e iconos propios) depende del issue #11; este paso no lo sustituye."

say "6/6 Proxy y HTTPS (Caddy)"
if [ "$MODE" = "online" ]; then
  PUBIP="$(curl -s -m 8 https://api.ipify.org || true)"
  warn "Modo online: Caddy abrirá los puertos 80 y 443 y pedirá el certificado a Let's Encrypt."
  printf '  Este Mac: IP pública %s | %s → %s | api.%s → %s\n' "${PUBIP:-?}" "$DOMAIN" "$(dig +short "$DOMAIN" | head -1)" "$DOMAIN" "$(dig +short "api.$DOMAIN" | head -1)"
  [ -n "$PUBIP" ] && [ "$(dig +short "$DOMAIN" | head -1)" = "$PUBIP" ] && [ "$(dig +short "api.$DOMAIN" | head -1)" = "$PUBIP" ] \
    || die "El DNS no apunta a este Mac. En Hostinger crea registros A para @ y api con $PUBIP, abre 80/443 en el router hacia este Mac y vuelve a ejecutar."
  read -r -p "  El DNS coincide. ¿Publicar $DOMAIN en internet desde este Mac? Escribe SI: " ans
  [ "$ans" = "SI" ] || die "Cancelado. No se ha publicado nada."
  cat > "$WORK/Caddyfile" <<EOF
{
  log { output file $LOGS/access.log { roll_size 10mb }  format json }
}
$DOMAIN {
  log
  root * $SITE
  encode gzip
  header { X-Content-Type-Options nosniff
           Referrer-Policy strict-origin-when-cross-origin }
  @app path /choisys /choisys/*
  handle @app { try_files {path} /choisys/index.html
                file_server }
  handle { file_server }
}
api.$DOMAIN {
  log
  reverse_proxy 127.0.0.1:$API_PORT
}
EOF
else
  cat > "$WORK/Caddyfile" <<EOF
{
  auto_https off
  admin off
  log { output file $LOGS/access.log { roll_size 10mb }  format json }
}
http://localhost:8080 {
  log
  root * $SITE
  encode gzip
  @app path /choisys /choisys/*
  handle @app { try_files {path} /choisys/index.html
                file_server }
  handle { file_server }
}
http://localhost:8090 {
  log
  reverse_proxy 127.0.0.1:$API_PORT
}
EOF
fi
caddy validate --config "$WORK/Caddyfile" --adapter caddyfile >/dev/null 2>&1 || die "Caddyfile no válido: caddy validate --config $WORK/Caddyfile"
if [ "$MODE" = "online" ]; then ( cd "$WORK" && sudo -v && nohup sudo caddy run --config "$WORK/Caddyfile" --adapter caddyfile > "$LOGS/caddy.log" 2>&1 & echo $! > "$RUN/caddy.pid" )
else ( cd "$WORK" && nohup caddy run --config "$WORK/Caddyfile" --adapter caddyfile > "$LOGS/caddy.log" 2>&1 & echo $! > "$RUN/caddy.pid" ); fi
printf '%s' "$MODE" > "$RUN/mode"
sleep 6
status
say "Listo. Landing: $APP_ORIGIN/  ·  choisys: $APP_ORIGIN/choisys/  ·  API: $API_URL"
say "Para ver el estado: bash lanzar-choisys.command estado   ·   para parar: bash lanzar-choisys.command parar"
