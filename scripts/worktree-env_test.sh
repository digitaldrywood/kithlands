#!/usr/bin/env bash
# Shell tests for scripts/worktree-env.sh.
# Asserts that two distinct working directories resolve to different
# (but internally-consistent) PORT / VITE_PORT / DB_NAME values, that the
# same directory resolves deterministically, and that PORT/VITE_PORT/DB_NAME
# track a single offset.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_SCRIPT="${SCRIPT_DIR}/worktree-env.sh"

if [ ! -f "${ENV_SCRIPT}" ]; then
  echo "FAIL: ${ENV_SCRIPT} not found" >&2
  exit 1
fi

# Load env vars from worktree-env.sh when invoked from DIR.
# Prints: PORT VITE_PORT API_PORT DB_NAME DATABASE_URL WORKTREE_OFFSET
_load() {
  local dir="$1"
  ( cd "$dir" && \
    unset PORT VITE_PORT API_PORT DB_NAME DATABASE_URL WORKTREE_OFFSET && \
    source "${ENV_SCRIPT}" && \
    printf '%s %s %s %s %s %s\n' "$PORT" "$VITE_PORT" "$API_PORT" "$DB_NAME" "$DATABASE_URL" "$WORKTREE_OFFSET" )
}

TMP_A="$(mktemp -d)"
TMP_B="$(mktemp -d)"
trap 'rm -rf "${TMP_A}" "${TMP_B}"' EXIT

read -r A_PORT A_VITE A_API A_DB A_URL A_OFFSET < <(_load "${TMP_A}")
read -r B_PORT B_VITE B_API B_DB B_URL B_OFFSET < <(_load "${TMP_B}")
# Determinism: run A again and require identical values.
read -r A2_PORT A2_VITE A2_API A2_DB A2_URL A2_OFFSET < <(_load "${TMP_A}")
ln -s "${TMP_A}" "${TMP_B}/alias"
read -r ALIAS_PORT ALIAS_VITE ALIAS_API ALIAS_DB ALIAS_URL ALIAS_OFFSET < <(_load "${TMP_B}/alias")

fail=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "${expected}" != "${actual}" ]; then
    echo "FAIL: ${name}: expected '${expected}', got '${actual}'" >&2
    fail=1
  fi
}

# Different PWDs → different offsets (collisions are possible but vanishingly
# rare at 1000-slot granularity; /tmp/tmp.XXX paths are effectively unique).
if [ "${A_OFFSET}" = "${B_OFFSET}" ]; then
  echo "FAIL: two distinct dirs produced the same offset (${A_OFFSET})" >&2
  fail=1
fi
if [ "${A_PORT}" = "${B_PORT}" ]; then
  echo "FAIL: two distinct dirs produced the same PORT (${A_PORT})" >&2
  fail=1
fi
if [ "${A_DB}" = "${B_DB}" ]; then
  echo "FAIL: two distinct dirs produced the same DB_NAME (${A_DB})" >&2
  fail=1
fi

# Same PWD → same values every time.
check "determinism PORT" "${A_PORT}" "${A2_PORT}"
check "determinism VITE_PORT" "${A_VITE}" "${A2_VITE}"
check "determinism API_PORT" "${A_API}" "${A2_API}"
check "determinism DB_NAME" "${A_DB}" "${A2_DB}"
check "determinism DATABASE_URL" "${A_URL}" "${A2_URL}"
check "symlink PORT" "${A_PORT}" "${ALIAS_PORT}"
check "symlink VITE_PORT" "${A_VITE}" "${ALIAS_VITE}"
check "symlink DATABASE_URL" "${A_URL}" "${ALIAS_URL}"

# PORT/VITE_PORT/DB_NAME must all agree on the same offset.
expected_port=$((8080 + A_OFFSET))
expected_vite=$((3000 + A_OFFSET))
expected_db="kithlands_${A_OFFSET}"
expected_url="postgres://${USER}@localhost:5432/${expected_db}?sslmode=disable"
check "PORT = 8080 + offset" "${expected_port}" "${A_PORT}"
check "VITE_PORT = 3000 + offset" "${expected_vite}" "${A_VITE}"
check "API_PORT = PORT" "${A_PORT}" "${A_API}"
check "DB_NAME = kithlands_<offset>" "${expected_db}" "${A_DB}"
check "DATABASE_URL uses derived DB" "${expected_url}" "${A_URL}"

# Offsets must be within [0, 999].
if [ "${A_OFFSET}" -lt 0 ] || [ "${A_OFFSET}" -gt 999 ]; then
  echo "FAIL: offset out of range: ${A_OFFSET}" >&2
  fail=1
fi

if [ ${fail} -ne 0 ]; then
  exit 1
fi

echo "ok scripts/worktree-env.sh (A=${A_OFFSET}, B=${B_OFFSET})"
