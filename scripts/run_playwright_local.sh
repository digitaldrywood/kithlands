#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

source scripts/worktree-env.sh

spec_args=("$@")
if [ ${#spec_args[@]} -eq 0 ]; then
  spec_args=("e2e/house-rest.spec.js")
fi

SERVER_LOG="/tmp/kithlands-server-${PORT}.log"
CLIENT_LOG="/tmp/kithlands-client-${VITE_PORT}.log"
GO_BIN="$(command -v go || true)"
if [ -z "$GO_BIN" ] && [ -x /usr/local/go/bin/go ]; then
  GO_BIN=/usr/local/go/bin/go
fi
if [ -z "$GO_BIN" ]; then
  echo "error: go not found (also checked /usr/local/go/bin/go)" >&2
  exit 1
fi

PLAYWRIGHT_TMP="$repo_root/client/tmp"
PLAYWRIGHT_HOME="$PLAYWRIGHT_TMP/home"
PLAYWRIGHT_XDG_CONFIG="$PLAYWRIGHT_TMP/xdg-config"
PLAYWRIGHT_XDG_CACHE="$PLAYWRIGHT_TMP/xdg-cache"
PLAYWRIGHT_BROWSERS="$PLAYWRIGHT_TMP/ms-playwright"

cleanup() {
  if [ -n "${CLIENT_PID:-}" ] && kill -0 "$CLIENT_PID" 2>/dev/null; then
    kill "$CLIENT_PID" 2>/dev/null || true
    wait "$CLIENT_PID" 2>/dev/null || true
  fi
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

kill_port_if_busy() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti "tcp:${port}" || true)
    if [ -n "$pids" ]; then
      kill $pids 2>/dev/null || true
    fi
  fi
}

wait_for_http() {
  local url=$1
  local label=$2
  for _ in $(seq 1 120); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "error: ${label} did not become reachable: ${url}" >&2
  return 1
}

wait_for_log() {
  local file=$1
  local needle=$2
  local label=$3
  for _ in $(seq 1 120); do
    if [ -f "$file" ] && grep -q "$needle" "$file"; then
      return 0
    fi
    sleep 0.5
  done
  echo "error: ${label} never logged readiness marker '${needle}'" >&2
  return 1
}

mkdir -p "$PLAYWRIGHT_HOME" "$PLAYWRIGHT_XDG_CONFIG" "$PLAYWRIGHT_XDG_CACHE" "$PLAYWRIGHT_BROWSERS" "$PLAYWRIGHT_TMP"

kill_port_if_busy "$PORT"
kill_port_if_busy "$VITE_PORT"
make setup-db >/dev/null

(
  cd server
  KITHLANDS_DEBUG=1 PORT="$PORT" DATABASE_URL="$DATABASE_URL" "$GO_BIN" run ./cmd/kithlands >"$SERVER_LOG" 2>&1
) &
SERVER_PID=$!

(
  cd client
  VITE_PORT="$VITE_PORT" API_PORT="$PORT" npx vite --host 0.0.0.0 --port "$VITE_PORT" >"$CLIENT_LOG" 2>&1
) &
CLIENT_PID=$!

wait_for_log "$SERVER_LOG" "kithlands server listening" "server"
wait_for_http "http://localhost:${PORT}/api/data/classes" "server API"
wait_for_http "http://localhost:${VITE_PORT}" "client"

(
  cd client
  HOME="$PLAYWRIGHT_HOME" \
    XDG_CONFIG_HOME="$PLAYWRIGHT_XDG_CONFIG" \
    XDG_CACHE_HOME="$PLAYWRIGHT_XDG_CACHE" \
    PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS" \
    npx playwright install chromium >/dev/null

  HOME="$PLAYWRIGHT_HOME" \
    XDG_CONFIG_HOME="$PLAYWRIGHT_XDG_CONFIG" \
    XDG_CACHE_HOME="$PLAYWRIGHT_XDG_CACHE" \
    PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS" \
    VITE_PORT="$VITE_PORT" \
    npx playwright test --config=e2e/playwright.config.js "${spec_args[@]}"
)
