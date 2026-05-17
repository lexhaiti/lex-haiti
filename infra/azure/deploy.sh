#!/usr/bin/env bash
# One-shot Azure resource creation for the LexHaïti prototype.
#
# Run from Azure Cloud Shell (https://shell.azure.com) — az is
# pre-authenticated. Idempotent where Azure allows: re-running with
# the same names skips already-existing resources, so you can stop
# halfway and resume. Stages are labelled so you can run sections
# selectively.
#
# Required env vars (set at the top of the file or `export` them):
#
#   LH_RG                  resource group name
#   LH_REGION              Azure region
#   LH_REGISTRY            ACR name (globally unique, lowercase, no dashes)
#   LH_DB_SERVER           Postgres server name (globally unique, lowercase)
#   LH_DB_NAME             Postgres database
#   LH_DB_ADMIN_USER       Postgres admin user
#   LH_DB_ADMIN_PWD        Postgres admin password (use `openssl rand -base64 24`)
#   LH_REDIS_NAME          Redis cache name (globally unique)
#   LH_CAE                 Container Apps Environment name
#   LH_API_APP             API Container App name
#   LH_WORKER_APP          Worker Container App name
#   LH_NEXTAUTH_SECRET     32+ random chars (Auth.js session secret)
#   LH_GH_REPO             owner/repo on GitHub (for service principal scope hint)
#
# After every step you can verify in the portal. Errors abort.

set -euo pipefail

: "${LH_RG:=lex-haiti-prod}"
: "${LH_REGION:=francecentral}"
: "${LH_REGISTRY:=lexhaitiregistry}"
: "${LH_DB_SERVER:=lex-haiti-db}"
: "${LH_DB_NAME:=lexhaiti}"
: "${LH_DB_ADMIN_USER:=lhadmin}"
: "${LH_REDIS_NAME:=lex-haiti-redis}"
: "${LH_CAE:=lex-haiti-env}"
: "${LH_API_APP:=lex-haiti-api}"
: "${LH_WORKER_APP:=lex-haiti-worker}"

bold()   { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()     { printf '   \033[32m✓ %s\033[0m\n' "$*"; }

require() {
  local var=$1
  if [[ -z "${!var:-}" ]]; then
    echo "error: \$${var} is required — set it before running" >&2
    exit 1
  fi
}
require LH_DB_ADMIN_PWD
require LH_NEXTAUTH_SECRET

# ─── 1. Resource group ──────────────────────────────────────────────
bold "Resource group: $LH_RG"
az group create --name "$LH_RG" --location "$LH_REGION" --only-show-errors >/dev/null
ok "ready"

# ─── 2. Container Registry ──────────────────────────────────────────
bold "Container Registry: $LH_REGISTRY"
az acr create --name "$LH_REGISTRY" --resource-group "$LH_RG" \
  --sku Basic --admin-enabled false --only-show-errors >/dev/null
ok "ready ($LH_REGISTRY.azurecr.io)"

# ─── 3. Postgres + pgvector ─────────────────────────────────────────
bold "Postgres Flexible Server: $LH_DB_SERVER"
# Burstable B2s is the smallest tier that supports pgvector cleanly.
# Note: as of the 2.66+ Azure CLI, ``--database-name`` was scoped to
# the Elastic Cluster mode. We create the server first and then add
# the database with ``flexible-server db create``.
az postgres flexible-server create \
  --name "$LH_DB_SERVER" \
  --resource-group "$LH_RG" \
  --location "$LH_REGION" \
  --tier Burstable --sku-name Standard_B2s \
  --version 16 \
  --admin-user "$LH_DB_ADMIN_USER" \
  --admin-password "$LH_DB_ADMIN_PWD" \
  --public-access 0.0.0.0 \
  --storage-size 32 \
  --yes --only-show-errors >/dev/null
ok "server up"

az postgres flexible-server db create \
  --resource-group "$LH_RG" --server-name "$LH_DB_SERVER" \
  --database-name "$LH_DB_NAME" --only-show-errors >/dev/null
ok "database $LH_DB_NAME created"

# Allowlist pgvector at the server level + create extension in the DB.
az postgres flexible-server parameter set \
  --resource-group "$LH_RG" --server-name "$LH_DB_SERVER" \
  --name azure.extensions --value VECTOR --only-show-errors >/dev/null
ok "pgvector allowlisted"

# CREATE EXTENSION needs a one-shot psql; the next stage runs Alembic
# from a container which can do it too. Leaving a hint for now:
echo "   ⚠ remember to run: CREATE EXTENSION IF NOT EXISTS vector; once before alembic upgrade head"

# ─── 4. Redis ───────────────────────────────────────────────────────
bold "Redis: $LH_REDIS_NAME"
az redis create \
  --name "$LH_REDIS_NAME" \
  --resource-group "$LH_RG" \
  --location "$LH_REGION" \
  --sku Basic --vm-size C0 \
  --only-show-errors >/dev/null
ok "ready"

# ─── 5. Container Apps Environment ──────────────────────────────────
bold "Container Apps Environment: $LH_CAE"
az containerapp env create \
  --name "$LH_CAE" \
  --resource-group "$LH_RG" \
  --location "$LH_REGION" \
  --only-show-errors >/dev/null
ok "ready"

# ─── 6. Connection strings (collected for env vars) ─────────────────
DB_URL="postgresql+psycopg2://${LH_DB_ADMIN_USER}:${LH_DB_ADMIN_PWD}@${LH_DB_SERVER}.postgres.database.azure.com:5432/${LH_DB_NAME}?sslmode=require"

REDIS_HOST="${LH_REDIS_NAME}.redis.cache.windows.net"
REDIS_KEY=$(az redis list-keys \
  --name "$LH_REDIS_NAME" --resource-group "$LH_RG" \
  --query primaryKey -o tsv)
REDIS_URL="rediss://:${REDIS_KEY}@${REDIS_HOST}:6380/0"

# ─── 7. API Container App ───────────────────────────────────────────
bold "API Container App: $LH_API_APP"
# Bootstrap with the hello-world image; the GH Actions deploy will
# swap it for the real backend image on the first push.
#
# ``--min-replicas 1`` keeps one instance warm 24/7. Scale-to-zero
# saved nothing in practice (Container Apps idle-rate is cheap, and
# Python + FastAPI + SQLAlchemy import time + DB-pool warm-up adds
# 8–20s to the first request after a 5-minute idle — visible on
# every cold visitor). The Worker stays at min=0 because background
# RQ jobs tolerate a startup delay.
az containerapp create \
  --name "$LH_API_APP" \
  --resource-group "$LH_RG" \
  --environment "$LH_CAE" \
  --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
  --target-port 8000 \
  --ingress external \
  --min-replicas 1 --max-replicas 3 \
  --cpu 0.5 --memory 1.0Gi \
  --secrets \
    database-url="$DB_URL" \
    redis-url="$REDIS_URL" \
    nextauth-secret="$LH_NEXTAUTH_SECRET" \
  --env-vars \
    DATABASE_URL=secretref:database-url \
    REDIS_URL=secretref:redis-url \
    NEXTAUTH_SECRET=secretref:nextauth-secret \
    PUBLIC_SITE_URL=https://lexhaiti.org \
  --registry-server "$LH_REGISTRY.azurecr.io" \
  --registry-identity system \
  --only-show-errors >/dev/null
ok "deployed (placeholder image)"

# ─── 8. Worker Container App ────────────────────────────────────────
bold "Worker Container App: $LH_WORKER_APP"
az containerapp create \
  --name "$LH_WORKER_APP" \
  --resource-group "$LH_RG" \
  --environment "$LH_CAE" \
  --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
  --command "rq worker --url \$REDIS_URL" \
  --min-replicas 0 --max-replicas 2 \
  --cpu 0.5 --memory 1.0Gi \
  --secrets \
    database-url="$DB_URL" \
    redis-url="$REDIS_URL" \
  --env-vars \
    DATABASE_URL=secretref:database-url \
    REDIS_URL=secretref:redis-url \
  --registry-server "$LH_REGISTRY.azurecr.io" \
  --registry-identity system \
  --only-show-errors >/dev/null
ok "deployed (placeholder image)"

# ─── 9. Migration Job ───────────────────────────────────────────────
# One-shot Container Apps Job that runs ``alembic upgrade head`` via
# scripts/run_migrations.py. Triggered from the GH Actions workflow
# BEFORE the API/worker revisions roll, so new code never races a
# schema it expects.
#
# The job is created with the helloworld placeholder image — the
# workflow overrides --image-name on every ``job start`` so the job
# always runs the same SHA that's about to roll on the API.
bold "Migration Job: lex-haiti-migrate"
az containerapp job create \
  --name "lex-haiti-migrate" \
  --resource-group "$LH_RG" \
  --environment "$LH_CAE" \
  --trigger-type Manual \
  --replica-timeout 600 \
  --replica-retry-limit 1 \
  --parallelism 1 \
  --replica-completion-count 1 \
  --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
  --command "python" "scripts/run_migrations.py" \
  --secrets \
    database-url="$DB_URL" \
  --env-vars \
    DATABASE_URL=secretref:database-url \
  --mi-system-assigned \
  --registry-server "$LH_REGISTRY.azurecr.io" \
  --registry-identity system \
  --only-show-errors >/dev/null
ok "migration job created"

# ─── 10. Grant Container Apps managed identity AcrPull on the registry
bold "Granting ACR pull to Container Apps"
ACR_ID=$(az acr show --name "$LH_REGISTRY" --query id -o tsv)
for app in "$LH_API_APP" "$LH_WORKER_APP"; do
  PRINCIPAL=$(az containerapp identity show \
    --name "$app" --resource-group "$LH_RG" \
    --query principalId -o tsv)
  az role assignment create \
    --assignee "$PRINCIPAL" \
    --role AcrPull \
    --scope "$ACR_ID" \
    --only-show-errors >/dev/null 2>&1 || true
done
# Same AcrPull grant for the migration job's identity so it can pull
# the backend image we just pushed.
JOB_PRINCIPAL=$(az containerapp job identity show \
  --name "lex-haiti-migrate" --resource-group "$LH_RG" \
  --query principalId -o tsv 2>/dev/null || true)
if [ -n "$JOB_PRINCIPAL" ]; then
  az role assignment create \
    --assignee "$JOB_PRINCIPAL" \
    --role AcrPull \
    --scope "$ACR_ID" \
    --only-show-errors >/dev/null 2>&1 || true
fi
ok "role assigned"

# ─── 10. Service principal for GitHub Actions ──────────────────────
bold "GitHub Actions service principal"
SUB_ID=$(az account show --query id -o tsv)
SP_JSON=$(az ad sp create-for-rbac \
  --name "lex-haiti-gh-deployer" \
  --role "Contributor" \
  --scopes "/subscriptions/$SUB_ID/resourceGroups/$LH_RG" \
  --sdk-auth)
echo "   ──── copy the block below into the GitHub secret AZURE_CREDENTIALS ────"
echo "$SP_JSON"
echo "   ──────────────────────────────────────────────────────────────────────"

# AcrPush on the registry so the workflow can build & push images.
SP_OBJ_ID=$(az ad sp list --display-name "lex-haiti-gh-deployer" --query "[0].id" -o tsv)
az role assignment create \
  --assignee "$SP_OBJ_ID" \
  --role AcrPush \
  --scope "$ACR_ID" \
  --only-show-errors >/dev/null || true
ok "AcrPush granted to deployer"

# ─── Final notes ────────────────────────────────────────────────────
API_FQDN=$(az containerapp show \
  --name "$LH_API_APP" --resource-group "$LH_RG" \
  --query properties.configuration.ingress.fqdn -o tsv)

cat <<EOF

─── Next steps ────────────────────────────────────────────────────────

1. In GitHub → Settings → Secrets and variables → Actions, add:
     AZURE_CREDENTIALS         (the JSON printed above)
     AZURE_RESOURCE_GROUP      $LH_RG
     AZURE_REGISTRY_NAME       $LH_REGISTRY
     AZURE_API_APP             $LH_API_APP
     AZURE_WORKER_APP          $LH_WORKER_APP

2. Push to main — the workflow builds the backend image, pushes to
   ACR, runs the lex-haiti-migrate job (alembic upgrade head against
   prod), and only then rolls both Container Apps to the new
   revision. No manual ``alembic upgrade`` step needed anymore.

3. Hook up the custom domain (api.lexhaiti.org) and TLS via the portal:
     Container Apps → $LH_API_APP → Custom domains → Add custom domain

4. Update Vercel env: NEXT_PUBLIC_API_URL=https://$API_FQDN
   (replace with https://api.lexhaiti.org once the custom domain is live)

To bypass migrations for a hotfix deploy (rare), set
``SKIP_MIGRATIONS=1`` on the lex-haiti-migrate job:
     az containerapp job update -n lex-haiti-migrate -g $LH_RG \\
       --set-env-vars SKIP_MIGRATIONS=1

EOF
