#!/usr/bin/env bash
# Applies the migrations + local auth stub to a scratch Postgres database and
# (optionally) runs the pgTAP suite. For use in a sandbox without Docker —
# see supabase/tests/00_local_auth_stub.sql for why this exists.
#
# Usage: supabase/tests/run-local.sh [--seed] [--pgtap]
set -euo pipefail

DB=criclife_test
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "drop database if exists ${DB};"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create database ${DB};"
# Mirrors supabase/config.toml's api.extra_search_path — extensions
# (pgcrypto, citext) install into their own schema, not public.
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "alter database ${DB} set search_path to public, extensions;"

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/tests/00_local_auth_stub.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "== applying $(basename "$f") =="
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done

if [[ "${1:-}" == "--seed" || "${2:-}" == "--seed" ]]; then
  echo "== applying seed.sql =="
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/seed.sql"
fi

if [[ "${1:-}" == "--pgtap" || "${2:-}" == "--pgtap" ]]; then
  echo "== running pgTAP suite =="
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -c "create extension if not exists pgtap;"
  for f in "$ROOT"/supabase/tests/pgtap/*.sql; do
    echo "-- $(basename "$f")"
    sudo -u postgres psql -d "$DB" -f "$f"
  done
fi

echo "== done =="
