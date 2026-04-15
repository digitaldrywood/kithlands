#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

source scripts/worktree-env.sh
if [ -f .envrc.local ]; then
  source .envrc.local
fi

runtime_dir="$repo_root/tmp/runtime"
bin_dir="$runtime_dir/bin"
log_dir="$runtime_dir/logs"

server_bin="$bin_dir/kithlands"
server_log="$log_dir/server.log"
client_log="$log_dir/client.log"

server_pid_file="$runtime_dir/server.pid"
client_pid_file="$runtime_dir/client.pid"

server_url="http://localhost:${PORT}"
client_url="http://localhost:${VITE_PORT}"

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "error: required command not found: ${name}" >&2
    exit 1
  fi
}

listener_pid() {
  local port="$1"
  { lsof -nP -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true; } | head -n 1
}

pid_is_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

pid_cwd() {
  local pid="$1"
  readlink -f "/proc/${pid}/cwd" 2>/dev/null || true
}

pid_exe() {
  local pid="$1"
  readlink -f "/proc/${pid}/exe" 2>/dev/null || true
}

pid_cmdline() {
  local pid="$1"
  tr '\0' ' ' <"/proc/${pid}/cmdline" 2>/dev/null || true
}

read_pid_file() {
  local file="$1"
  if [ -f "$file" ]; then
    tr -d '[:space:]' <"$file"
  fi
}

write_pid_file() {
  local file="$1"
  local pid="$2"
  printf '%s\n' "$pid" >"$file"
}

remove_pid_file() {
  local file="$1"
  rm -f "$file"
}

wait_for_listener() {
  local port="$1"
  local label="$2"

  for _ in $(seq 1 120); do
    if [ -n "$(listener_pid "$port")" ]; then
      return 0
    fi
    sleep 0.5
  done

  echo "error: ${label} never opened port ${port}" >&2
  return 1
}

wait_for_http() {
  local url="$1"
  local label="$2"

  for _ in $(seq 1 120); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "error: ${label} never became reachable at ${url}" >&2
  return 1
}

verify_server_pid() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  pid_is_running "$pid" || return 1
  [ "$(listener_pid "$PORT")" = "$pid" ] || return 1
  [ "$(pid_exe "$pid")" = "$server_bin" ] || return 1
}

verify_client_pid() {
  local pid="$1"
  local cmdline

  [ -n "$pid" ] || return 1
  pid_is_running "$pid" || return 1
  [ "$(listener_pid "$VITE_PORT")" = "$pid" ] || return 1
  [ "$(pid_cwd "$pid")" = "$repo_root/client" ] || return 1

  cmdline=$(pid_cmdline "$pid")
  case "$cmdline" in
    *vite*"$VITE_PORT"*)
      return 0
      ;;
  esac

  return 1
}

stop_tracked_process() {
  local label="$1"
  local pid_file="$2"
  local verifier="$3"

  local pid
  pid=$(read_pid_file "$pid_file")
  if [ -z "$pid" ]; then
    return 0
  fi

  if "$verifier" "$pid"; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 40); do
      if ! pid_is_running "$pid"; then
        remove_pid_file "$pid_file"
        return 0
      fi
      sleep 0.25
    done

    kill -9 "$pid" 2>/dev/null || true
    remove_pid_file "$pid_file"
    return 0
  fi

  echo "warning: refusing to kill ${label}; pid ${pid} no longer matches this worktree runtime" >&2
  remove_pid_file "$pid_file"
}

ensure_port_free() {
  local port="$1"
  local label="$2"
  local pid

  pid=$(listener_pid "$port")
  if [ -n "$pid" ]; then
    echo "error: ${label} port ${port} is already owned by pid ${pid}" >&2
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >&2 || true
    exit 1
  fi
}

ensure_runtime_dirs() {
  mkdir -p "$bin_dir" "$log_dir"
}

spawn_detached() {
  local dir="$1"
  local log_file="$2"
  shift 2

  : >"$log_file"
  (
    cd "$dir"
    setsid -f "$@" </dev/null >>"$log_file" 2>&1
  )
}

setup_db() {
  export PORT VITE_PORT API_PORT DB_NAME DATABASE_URL WORKTREE_OFFSET
  make --no-print-directory setup-db >/dev/null
}

start_server() {
  echo "Building Kithlands server binary..."
  (
    cd server
    go build -o "$server_bin" ./cmd/kithlands
  )

  echo "Starting Kithlands server on ${server_url}..."
  spawn_detached "$repo_root/server" "$server_log" env PORT="$PORT" DATABASE_URL="$DATABASE_URL" "$server_bin"

  wait_for_listener "$PORT" "server"
  wait_for_http "${server_url}/api/data/classes" "server API"
  write_pid_file "$server_pid_file" "$(listener_pid "$PORT")"
}

start_client() {
  echo "Starting Phaser client on ${client_url}..."
  spawn_detached "$repo_root/client" "$client_log" env VITE_PORT="$VITE_PORT" API_PORT="$PORT" npx vite --host 0.0.0.0 --port "$VITE_PORT"

  wait_for_listener "$VITE_PORT" "client"
  wait_for_http "$client_url" "client"
  write_pid_file "$client_pid_file" "$(listener_pid "$VITE_PORT")"
}

play() {
  require_command lsof
  require_command curl
  require_command go
  require_command npx
  require_command setsid

  ensure_runtime_dirs
  stop
  setup_db
  ensure_port_free "$PORT" "server"
  ensure_port_free "$VITE_PORT" "client"

  start_server
  start_client

  echo
  echo "========================================="
  echo "  KITHLANDS is running!"
  echo
  echo "  Worktree: $repo_root"
  echo "  Offset:   $WORKTREE_OFFSET"
  echo "  Game:     $client_url"
  echo "  Sprites:  ${client_url}/sprites.html"
  if [ -n "${TAILSCALE_HOSTNAME:-}" ]; then
    echo "  Network:  http://${TAILSCALE_HOSTNAME}:${VITE_PORT}"
    echo "  Sprites:  http://${TAILSCALE_HOSTNAME}:${VITE_PORT}/sprites.html"
  fi
  echo "  API:      $server_url"
  if [ -n "${TAILSCALE_HOSTNAME:-}" ]; then
    echo "  API Net:  http://${TAILSCALE_HOSTNAME}:${PORT}"
  fi
  echo "  DB:       $DB_NAME"
  echo "  Runtime:  $runtime_dir"
  echo "  Logs:     $server_log"
  echo "            $client_log"
  echo "  Stop:     make stop"
  echo "========================================="
}

stop() {
  require_command lsof

  stop_tracked_process "client" "$client_pid_file" verify_client_pid
  stop_tracked_process "server" "$server_pid_file" verify_server_pid
}

usage() {
  cat <<'EOF'
usage: scripts/worktree-stack.sh <play|stop>
EOF
}

case "${1:-}" in
  play)
    play
    ;;
  stop)
    stop
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
