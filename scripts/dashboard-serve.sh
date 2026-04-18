#!/usr/bin/env bash
# Cross-worktree PM dashboard server launcher.
#
# Starts (or stops) the dashboard binary that aggregates screenshots from every
# active Kithlands worktree and exposes them via a dark-themed web UI on
# port 3999.
#
# Because the dashboard is intentionally a SINGLETON across every worktree
# (fixed port, cross-worktree aggregator), the PID / log / bin files live
# under a user-global cache directory — NOT the per-worktree tmp/. That way
# `make dashboard-status` / `dashboard-stop` reach the correct process from
# any worktree.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

# Optional worktree-local secrets (TAILSCALE_HOSTNAME lives here).
if [ -f .envrc.local ]; then
  # shellcheck disable=SC1091
  source .envrc.local
fi

port="${DASHBOARD_PORT:-3999}"

# Default to loopback. Only expose beyond the host when Tailscale is wired up,
# so the server doesn't sit open on untrusted networks (coffee shop wifi, etc).
if [ -n "${TAILSCALE_HOSTNAME:-}" ]; then
  listen_addr="${DASHBOARD_LISTEN:-0.0.0.0:${port}}"
else
  listen_addr="${DASHBOARD_LISTEN:-127.0.0.1:${port}}"
fi

# projects-dir defaults to the repo's parent; no need to plumb this through
# unless the user explicitly overrides.
projects_dir="${DASHBOARD_PROJECTS_DIR:-$(cd "$repo_root/.." && pwd)}"

# User-global state (same across every worktree).
state_dir="${XDG_CACHE_HOME:-$HOME/.cache}/kithlands-dashboard"
mkdir -p "$state_dir"
pid_file="$state_dir/dashboard.pid"
log_file="$state_dir/dashboard.log"
bin_dir="$state_dir/bin"
mkdir -p "$bin_dir"
bin_path="$bin_dir/dashboard"

usage() {
  echo "usage: $0 [start|stop|status]" >&2
  exit 2
}

action="${1:-start}"

pid_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# Confirms $1 is actually our dashboard binary before we signal it. Reads
# /proc/<pid>/comm when available (Linux), otherwise falls back to `ps`. This
# stops a stale PID that a kernel recycled to an unrelated process from being
# killed by `make dashboard-stop`.
pid_is_dashboard() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  if [ -r "/proc/$pid/comm" ]; then
    local comm
    comm=$(tr -d '\n' <"/proc/$pid/comm")
    [ "$comm" = "dashboard" ]
    return $?
  fi
  if command -v ps >/dev/null 2>&1; then
    ps -o comm= -p "$pid" 2>/dev/null | grep -qx "dashboard"
    return $?
  fi
  return 1
}

read_pid() {
  [ -f "$pid_file" ] || return 1
  local pid
  pid=$(tr -d '[:space:]' <"$pid_file" 2>/dev/null || true)
  [ -n "$pid" ] || return 1
  echo "$pid"
}

stop_server() {
  local pid
  if pid=$(read_pid); then
    if pid_running "$pid" && pid_is_dashboard "$pid"; then
      kill "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5; do
        pid_running "$pid" || break
        sleep 0.2
      done
      if pid_running "$pid" && pid_is_dashboard "$pid"; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      echo "dashboard stopped (pid $pid)"
    elif pid_running "$pid"; then
      echo "dashboard pid file points at pid $pid but that process is NOT the dashboard — refusing to kill it"
    else
      echo "dashboard pid file stale (pid $pid not running)"
    fi
  else
    echo "dashboard not running"
  fi
  rm -f "$pid_file"
}

status_server() {
  local pid
  if pid=$(read_pid) && pid_running "$pid" && pid_is_dashboard "$pid"; then
    echo "dashboard running on $listen_addr (pid $pid)"
    return 0
  fi
  echo "dashboard not running"
  return 1
}

case "$action" in
  stop)
    stop_server
    exit 0
    ;;
  status)
    status_server
    exit $?
    ;;
  start)
    :
    ;;
  *)
    usage
    ;;
esac

# Refuse to start a second instance if a real dashboard is already running.
if existing=$(read_pid) && pid_running "$existing" && pid_is_dashboard "$existing"; then
  echo "dashboard already running (pid $existing) on $listen_addr"
  echo "  open: http://localhost:${port}"
  if [ -n "${TAILSCALE_HOSTNAME:-}" ]; then
    echo "  open: http://${TAILSCALE_HOSTNAME}:${port}"
  fi
  exit 0
fi
rm -f "$pid_file"

# Build the binary into the shared state dir.
(cd server && go build -o "$bin_path" ./cmd/dashboard)

# Launch detached, capture the PID, redirect logs.
nohup "$bin_path" -listen "$listen_addr" -projects-dir "$projects_dir" >"$log_file" 2>&1 &
pid=$!
echo "$pid" >"$pid_file"

# Health-check: the binary must still be alive after a brief moment.
sleep 0.4
if ! pid_running "$pid"; then
  echo "dashboard failed to start — tail of $log_file:" >&2
  tail -n 40 "$log_file" >&2 || true
  rm -f "$pid_file"
  exit 1
fi

echo "dashboard started (pid $pid) on $listen_addr"
echo "  open: http://localhost:${port}"
if [ -n "${TAILSCALE_HOSTNAME:-}" ]; then
  echo "  open: http://${TAILSCALE_HOSTNAME}:${port}"
fi
echo "  logs: $log_file"
echo "  stop: make dashboard-stop"
