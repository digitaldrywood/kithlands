#!/usr/bin/env bash
# Per-worktree isolated ports and database.
# Sourced by .envrc (direnv) — exports PORT, VITE_PORT, API_PORT, DB_NAME, DATABASE_URL.
#
# The offset is derived from a hash of $PWD so every worktree path
# deterministically maps to its own ports + database name. This lets
# `make play` and `make test-e2e` run concurrently in multiple worktrees
# without fighting over 8080/3000 or the shared `kithlands` database.

set -eu

# First 4 hex chars of md5(PWD) → 16 bits → modulo 1000 keeps us in a predictable range.
_kith_hash=$(printf '%s' "$PWD" | md5sum | head -c 4)
_kith_offset=$((16#${_kith_hash} % 1000))

export WORKTREE_OFFSET="${_kith_offset}"
export PORT=$((8080 + _kith_offset))
export VITE_PORT=$((3000 + _kith_offset))
export API_PORT="${PORT}"
export DB_NAME="kithlands_${_kith_offset}"

# DATABASE_URL uses the local OS user (peer/trust auth against a local
# postgres). Dockerized postgres with password auth is handled by the
# Makefile's DATABASE_URL default instead. Override in .envrc.local if
# you need a different connection string.
export DATABASE_URL="postgres://${USER}@localhost:5432/${DB_NAME}?sslmode=disable"

unset _kith_hash _kith_offset
