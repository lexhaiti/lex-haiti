# Azure deployment

Prototype-grade deploy for the LexHaïti backend on Azure Container
Apps + Database for PostgreSQL Flexible Server + Cache for Redis,
fronted on the public side by Vercel.

## One-shot bring-up

From [Azure Cloud Shell](https://shell.azure.com) (bash):

```bash
# Choose your secrets first
export LH_DB_ADMIN_PWD="$(openssl rand -base64 24)"
export LH_NEXTAUTH_SECRET="$(openssl rand -base64 32)"

# Clone the repo into Cloud Shell (clouddrive persists across sessions)
git clone https://github.com/lexhaiti/lex-haiti.git
cd lex-haiti

# Run the bring-up script
bash infra/azure/deploy.sh
```

Save both secrets in a password manager — Postgres password resets
require disconnecting every app first, and `NEXTAUTH_SECRET` rotation
invalidates every editor session.

## What the script creates

| Resource | Name (default) | Tier |
|---|---|---|
| Resource group | `lex-haiti-prod` | — |
| Container Registry | `lexhaitiregistry.azurecr.io` | Basic |
| Postgres Flexible Server | `lex-haiti-db.postgres.database.azure.com` | Burstable B2s |
| Cache for Redis | `lex-haiti-redis.redis.cache.windows.net` | Basic C0 |
| Container Apps Environment | `lex-haiti-env` | — |
| Container App (API) | `lex-haiti-api` | scale-to-zero |
| Container App (worker) | `lex-haiti-worker` | scale-to-zero |
| Service principal | `lex-haiti-gh-deployer` | Contributor on RG + AcrPush |

## After bring-up

1. **Drop the service-principal JSON** into the GitHub secret
   `AZURE_CREDENTIALS` (Settings → Secrets and variables → Actions).
   Add the other secrets / variables the workflow expects (see the
   header of `.github/workflows/deploy-azure.yml`).
2. **Push to `main`** — the workflow builds, pushes the image to ACR,
   and rolls both Container Apps to the new revision.
3. **Run migrations** once the API is healthy:
   ```bash
   az containerapp exec -n lex-haiti-api -g lex-haiti-prod \
     --command "alembic -c migrations/alembic.ini upgrade head"
   ```
4. **Custom domain**: portal → `lex-haiti-api` → Custom domains.
   Add `api.lexhaiti.org` and follow the CNAME + asuid TXT instructions.
5. **Vercel env**: set `NEXT_PUBLIC_API_URL=https://api.lexhaiti.org`
   and CORS allowlist `https://lexhaiti.org` + your Vercel preview
   hostnames on the FastAPI side.

## Cost ceiling

Steady-state baseline (no traffic):

| | Monthly |
|---|---|
| Postgres B2s | ~$24 |
| Redis C0 | ~$16 |
| Container Apps (scale-to-zero) | ~$0 idle, ~$0.000024/vCPU-s when up |
| Container Registry Basic | ~$5 |
| Bandwidth + storage | ~$5–10 |
| **Total** | **~$50–60/mo idle** |

Active traffic adds Container Apps compute charges per request. The
$1000 Azure credit covers ~12–18 months at prototype usage levels.

## Storage trade-off (deferred)

The backend's `MONITEUR_PDF_DIR` env var currently points at a local
filesystem path. In Container Apps that path is ephemeral, so PDFs
disappear on container restart. Options:

- **Backblaze B2** (per ADR-001): wire `boto3` against B2, keep the
  cross-cloud option open. Single-file change in
  `api/routes/moniteur.py` once B2 keys are added to env vars.
- **Azure Files** mounted into the Container App at `/data/moniteur`:
  zero code change, persistent, ~$0.05/GB/mo. Azure-only.

Neither is wired by `deploy.sh` — the prototype tolerates ephemeral
storage until the first editor actually uploads a Moniteur PDF.
