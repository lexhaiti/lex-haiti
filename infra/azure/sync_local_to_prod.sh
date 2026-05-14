#!/usr/bin/env bash
# Dump the local ``public_corpus`` schema and restore it on the Azure
# Flexible Server. Editor accounts, sessions, and verification tokens
# (the ``auth`` schema) are untouched.
#
# Required env vars:
#   LH_DB_SERVER        e.g. lex-haiti-db
#   LH_DB_NAME          e.g. lexhaiti
#   LH_DB_ADMIN_USER    e.g. lhadmin
#   LH_DB_ADMIN_PWD     the admin password (no @ / : / / characters)
#
# Optional:
#   LH_LOCAL_DB_CONTAINER  docker container name (default: lexhaiti-db)
#   LH_LOCAL_DB_USER       local pg user (default: lexhaiti)
#   LH_LOCAL_DB_NAME       local pg database (default: lexhaiti)
#
# Usage::
#
#   export LH_DB_SERVER=lex-haiti-db
#   export LH_DB_NAME=lexhaiti
#   export LH_DB_ADMIN_USER=lhadmin
#   export LH_DB_ADMIN_PWD='...'
#   bash infra/azure/sync_local_to_prod.sh
#
# WARNING: this is destructive. ``pg_dump --clean --if-exists`` is
# included so existing tables in ``public_corpus`` are DROPPED before
# the new schema lands. The ``auth`` schema is untouched.

set -euo pipefail

: "${LH_LOCAL_DB_CONTAINER:=lexhaiti-db}"
: "${LH_LOCAL_DB_USER:=lexhaiti}"
: "${LH_LOCAL_DB_NAME:=lexhaiti}"

require() {
  if [ -z "${!1:-}" ]; then
    echo "missing required env var: $1" >&2
    exit 1
  fi
}
require LH_DB_SERVER
require LH_DB_NAME
require LH_DB_ADMIN_USER
require LH_DB_ADMIN_PWD

PROD_HOST="${LH_DB_SERVER}.postgres.database.azure.com"

echo "== Source =="
echo "  local docker container : $LH_LOCAL_DB_CONTAINER"
echo "  local pg database      : $LH_LOCAL_DB_NAME"
echo
echo "== Destination =="
echo "  Azure host             : $PROD_HOST"
echo "  Azure database         : $LH_DB_NAME"
echo "  Azure user             : $LH_DB_ADMIN_USER"
echo
echo "This will DROP all tables in the public_corpus schema on prod and"
echo "replace them with the local snapshot. The auth schema (editor"
echo "accounts + sessions) is untouched."
echo
read -r -p "Proceed? type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
  echo "aborted"
  exit 1
fi

# Verify connectivity to local + prod before kicking off the long dump.
echo "→ Checking local connectivity"
docker exec "$LH_LOCAL_DB_CONTAINER" pg_isready -U "$LH_LOCAL_DB_USER" -d "$LH_LOCAL_DB_NAME" >/dev/null

echo "→ Checking prod connectivity"
docker exec -i -e PGPASSWORD="$LH_DB_ADMIN_PWD" "$LH_LOCAL_DB_CONTAINER" psql \
  "host=$PROD_HOST port=5432 user=$LH_DB_ADMIN_USER dbname=$LH_DB_NAME sslmode=require" \
  -c "SELECT 1;" >/dev/null

echo "→ Dumping local public_corpus and piping into prod"

# Both pg_dump and psql run inside the existing local Postgres
# container — that's where the pg-client binaries live on a typical
# Mac dev box (the host doesn't usually have psql on PATH). The
# container has outbound network access, so it can reach the Azure
# Flexible Server fine; the password is passed via -e so it never
# lands on the shell command line of any other process.
#
# pg_dump flags:
#   --schema=public_corpus    only the legal-graph schema
#   --clean --if-exists       prefix the script with DROP IF EXISTS
#   --no-owner                Azure user owns the result
#   --no-privileges           skip GRANT/REVOKE
#   --no-publications --no-subscriptions   safe pruning of pg16 metadata
docker exec "$LH_LOCAL_DB_CONTAINER" pg_dump \
  -U "$LH_LOCAL_DB_USER" \
  -d "$LH_LOCAL_DB_NAME" \
  --schema=public_corpus \
  --clean --if-exists \
  --no-owner --no-privileges \
  --no-publications --no-subscriptions \
| docker exec -i -e PGPASSWORD="$LH_DB_ADMIN_PWD" "$LH_LOCAL_DB_CONTAINER" psql \
    "host=$PROD_HOST port=5432 user=$LH_DB_ADMIN_USER dbname=$LH_DB_NAME sslmode=require" \
    --set=ON_ERROR_STOP=on \
    -v VERBOSITY=terse \
    -q

echo "→ Sync complete. Sanity check:"
docker exec -i -e PGPASSWORD="$LH_DB_ADMIN_PWD" "$LH_LOCAL_DB_CONTAINER" psql \
  "host=$PROD_HOST port=5432 user=$LH_DB_ADMIN_USER dbname=$LH_DB_NAME sslmode=require" \
  -c "
    SELECT 'legal_texts'   AS table, COUNT(*) FROM public_corpus.legal_texts
    UNION ALL
    SELECT 'articles',       COUNT(*) FROM public_corpus.articles
    UNION ALL
    SELECT 'article_versions',COUNT(*) FROM public_corpus.article_versions
    UNION ALL
    SELECT 'legal_changes',  COUNT(*) FROM public_corpus.legal_changes
    UNION ALL
    SELECT 'legal_headings', COUNT(*) FROM public_corpus.legal_headings
    UNION ALL
    SELECT 'moniteur_issues',COUNT(*) FROM public_corpus.moniteur_issues
    ORDER BY table;
  "

echo "done"
