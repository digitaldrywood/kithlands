#!/usr/bin/env bash
# Cross-worktree PM dashboard server launcher.
#
# Starts (or stops) the dashboard binary that aggregates screenshots from every
# active Kithlands worktree and exposes them via a dark-themed web UI on
# localhost:3999. The port is intentionally fixed (not per-worktree) because
# the dashboard is a cross-worktree aggregator — run exactly one instance.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

# Optional worktree-local secrets (TAILSCALE_HOSTNAME lives here).
if [ -f .envrc.local ]; then
  # shellcheck disable=SC1091
  source .envrc.local
fi

port="${DASHBOARD_PORT:-3999}"
runtime_dir="$repo_root/tmp"
mkdir -p "$runtime_dir"
pid_file="$runtime_dir/dashboard.pid"
log_file="$runtime_dir/dashboard.log"

usage() {
  echo "usage: $0 [start|stop|status]" >&2
  exit 2
}

action="${1:-start}"

pid_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
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
    if pid_running "$pid"; then
      kill "$pid" 2>/dev/null || true
      # Give it a moment to shut down cleanly.
      for _ in 1 2 3 4 5; do
        pid_running "$pid" || break
        sleep 0.2
      done
      if pid_running "$pid"; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      echo "dashboard stopped (pid $pid)"
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
  if pid=$(read_pid) && pid_running "$pid"; then
    echo "dashboard running on port $port (pid $pid)"
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

# Refuse to start a second instance.
if existing=$(read_pid) && pid_running "$existing"; then
  echo "dashboard already running (pid $existing) on port $port"
  echo "open: http://localhost:${port}"
  if [ -n "${TAILSCALE_HOSTNAME:-}" ]; then
    echo "open: http://${TAILSCALE_HOSTNAME}:${port}"
  fi
  exit 0
fi
rm -f "$pid_file"

# Build the binary into a stable location so repeat starts are quick.
bin_dir="$runtime_dir/bin"
mkdir -p "$bin_dir"
bin_path="$bin_dir/dashboard"
(cd server && go build -o "$bin_path" ./cmd/dashboard)

# Launch detached, capture the PID, redirect logs.
nohup "$bin_path" -port "$port" >"$log_file" 2>&1 &
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

echo "dashboard started (pid $pid)"
echo "  open: http://localhost:${port}"
if [ -n "${TAILSCALE_HOSTNAME:-}" ]; then
  echo "  open: http://${TAILSCALE_HOSTNAME}:${port}"
fi
echo "  logs: $log_file"
echo "  stop: make dashboard-stop"
