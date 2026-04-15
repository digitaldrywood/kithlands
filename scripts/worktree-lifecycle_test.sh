#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

if ! command -v curl >/dev/null 2>&1; then
  echo "FAIL: curl not found" >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "FAIL: tar not found" >&2
  exit 1
fi

secondary_root=$(mktemp -d "${TMPDIR:-/tmp}/kithlands-lifecycle-XXXXXX")
cleanup() {
  make --no-print-directory stop >/dev/null 2>&1 || true
  if [ -d "$secondary_root" ]; then
    make --no-print-directory -C "$secondary_root" stop >/dev/null 2>&1 || true
    rm -rf "$secondary_root"
  fi
}
trap cleanup EXIT

(
  cd "$repo_root"
  tar --exclude=.git --exclude=tmp -cf - .
) | (
  cd "$secondary_root"
  tar -xf -
)

if [ -d "$repo_root/client/node_modules" ] && [ ! -e "$secondary_root/client/node_modules" ]; then
  ln -s "$repo_root/client/node_modules" "$secondary_root/client/node_modules"
fi

load_env() {
  local dir="$1"
  (
    cd "$dir"
    source scripts/worktree-env.sh
    printf '%s %s %s %s\n' "$PORT" "$VITE_PORT" "$DB_NAME" "$WORKTREE_OFFSET"
  )
}

wait_for_down() {
  local url="$1"
  local label="$2"

  for _ in $(seq 1 60); do
    if ! curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "FAIL: ${label} stayed reachable at ${url}" >&2
  exit 1
}

wait_for_up() {
  local url="$1"
  local label="$2"

  for _ in $(seq 1 120); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "FAIL: ${label} never became reachable at ${url}" >&2
  exit 1
}

read -r primary_port primary_vite primary_db primary_offset < <(load_env "$repo_root")
read -r secondary_port secondary_vite secondary_db secondary_offset < <(load_env "$secondary_root")

echo "primary:   root=$repo_root offset=$primary_offset port=$primary_port vite=$primary_vite db=$primary_db"
echo "secondary: root=$secondary_root offset=$secondary_offset port=$secondary_port vite=$secondary_vite db=$secondary_db"

if [ "$primary_port" = "$secondary_port" ] || [ "$primary_vite" = "$secondary_vite" ] || [ "$primary_db" = "$secondary_db" ]; then
  echo "FAIL: separate worktrees derived overlapping runtime values" >&2
  exit 1
fi

echo "Starting primary worktree..."
make --no-print-directory play >/tmp/kithlands-primary-play.log
wait_for_up "http://localhost:${primary_port}/api/data/classes" "primary server"
wait_for_up "http://localhost:${primary_vite}" "primary client"
echo "Primary listeners:"
lsof -nP -iTCP:"${primary_port}" -sTCP:LISTEN
lsof -nP -iTCP:"${primary_vite}" -sTCP:LISTEN

echo "Starting secondary worktree..."
make --no-print-directory -C "$secondary_root" play >/tmp/kithlands-secondary-play.log
wait_for_up "http://localhost:${secondary_port}/api/data/classes" "secondary server"
wait_for_up "http://localhost:${secondary_vite}" "secondary client"
echo "Secondary listeners:"
lsof -nP -iTCP:"${secondary_port}" -sTCP:LISTEN
lsof -nP -iTCP:"${secondary_vite}" -sTCP:LISTEN

echo "Stopping primary worktree..."
make --no-print-directory stop >/tmp/kithlands-primary-stop.log
wait_for_down "http://localhost:${primary_port}/api/data/classes" "primary server"
wait_for_down "http://localhost:${primary_vite}" "primary client"
wait_for_up "http://localhost:${secondary_port}/api/data/classes" "secondary server after primary stop"
wait_for_up "http://localhost:${secondary_vite}" "secondary client after primary stop"
echo "Secondary listeners after primary stop:"
lsof -nP -iTCP:"${secondary_port}" -sTCP:LISTEN
lsof -nP -iTCP:"${secondary_vite}" -sTCP:LISTEN

echo "Stopping secondary worktree..."
make --no-print-directory -C "$secondary_root" stop >/tmp/kithlands-secondary-stop.log
wait_for_down "http://localhost:${secondary_port}/api/data/classes" "secondary server"
wait_for_down "http://localhost:${secondary_vite}" "secondary client"

echo "ok worktree lifecycle isolation"
