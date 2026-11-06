# Kestrel web app on Google Cloud Run

Deployed: 2026-11-02
Project: `<gcp-project-id>`
Region: `us-east1`
Service: `kestrel-web`

## What is live

| URL                                                          | Status                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `https://kestrel-web-<service-hash>-ue.a.run.app`            | Canonical URL reported by Cloud Run                                             |
| `https://kestrel-web-<project-number>.us-east1.run.app`      | Legacy-format alias, also serves (this is what is baked into the client bundle) |

The worker VM, the Vercel deployment and the Supabase database are untouched. Cloud Run talks to
the **same Supabase database** as production, so both front doors serve the same data.

### Verified

- `/api/health/public` returns 200 with `{"status":"ok"}`
- `/` returns 200
- `/login` returns 200, ~50 KB, ~1.2s warm
- Container boot completes migrations against Supabase and logs the DB password redacted as `***`
- Cold start (container provisioning + migrations + Next boot): **~17s**. Warm requests ~1.2s.

## Why us-east1

The repo and the worker VM's env both point at `aws-1-us-east-1.pooler.supabase.com`, so the database
is in **us-east-1**. The web app issues many queries per page render, so it is placed next to the
database (`us-east1`, South Carolina), not next to the worker VM (`us-central1`). The worker VM stays
where it is. This is a Tier 1 region, so Cloud Run's free tier applies identically to us-central1.

## Configuration

Runtime environment variables:

```
NODE_ENV=production
MULTI_USER_ENABLED=1
KESTREL_ENABLE_RLS=1
REGISTRATION_MODE=disabled      # deliberately closed; production is 'open'
DB_POOL_MAX=3
NEXT_PUBLIC_APP_URL, AUTH_URL, NEXTAUTH_URL = <the Cloud Run URL>
```

Secrets, all in Secret Manager and mounted with `--set-secrets` (never stored in the service config):

`kestrel-auth-secret`, `kestrel-encryption-secret`, `kestrel-cron-secret`,
`kestrel-database-url`, `kestrel-direct-url`, `kestrel-admin-database-url`,
`kestrel-supabase-ca-cert`, `kestrel-auth-cookie-secret`, `kestrel-supabase-url`

They were copied from `/opt/kestrel/.env` on `kestrel-worker`. **`ENCRYPTION_SECRET` must never be
regenerated**: it decrypts the BYOK provider keys already stored in Supabase.

Scaling: `--min-instances 0`, `--max-instances 2`, 1 GiB / 1 vCPU, request timeout 3600s.

## Rebuilding and redeploying

`Dockerfile` uses BuildKit-only syntax (`COPY --link`, `RUN --mount=type=cache`) **and** requires
Dockerfile frontend >= 1.3. Cloud Build's built-in frontend is older and fails with
`dockerfile parse error line 79: Unknown flag: link`. The build therefore generates a temporary
Dockerfile with a pinned frontend rather than editing the repo's file.

The upstream fix, which belongs in the repository, is to add this as the first line of `Dockerfile`:

```
# syntax=docker/dockerfile:1.7
```

Deploy command:

```sh
gcloud run deploy kestrel-web \
  --project <gcp-project-id> \
  --region us-east1 \
  --image us-east1-docker.pkg.dev/<gcp-project-id>/kestrel/web:v2 \
  --platform managed --allow-unauthenticated --port 3000 \
  --memory 1Gi --cpu 1 --timeout 3600 \
  --min-instances 0 --max-instances 2 --cpu-boost \
  --set-env-vars "..." --set-secrets "..."
```

`NEXT_PUBLIC_APP_URL` is inlined into the client bundle at **build** time, so changing the public URL
requires a rebuild, not just a redeploy.

## Roll back

```sh
gcloud run services update-traffic kestrel-web --region us-east1 --to-revisions kestrel-web-00001-rev=100
```

Or delete the service entirely; nothing else depends on it:

```sh
gcloud run services delete kestrel-web --region us-east1
```

## Open items

1. **Migrations run on every cold start.** They complete in ~2s and the runner takes an advisory lock,
   so concurrent instances are safe, but with scale-to-zero this happens on every wake-up and delays
   the first request. Moving migrations to a Cloud Run Job would remove it from the request path.
2. **Canonical URL mismatch.** Cloud Run now reports the `...-ue.a.run.app` form while the client bundle
   has the legacy form baked in. Both resolve to the same service, so nothing breaks. Resolve it
   properly by deploying under the real domain.
3. **`REGISTRATION_MODE=disabled`** differs from production (`open`). Intentional while evaluating.
4. **Cold starts.** ~17s. `--min-instances 1` removes it for roughly $5-6/month.
5. **No scheduler yet.** The 14 `/api/cron/*` routes need an external caller with the `CRON_SECRET`
   bearer token. Cloud Scheduler can replace whatever pokes them today.

## Cost

Cloud Run scales to zero, so an idle service costs ~$0. The free tier covers 180,000 vCPU-seconds,
360,000 GiB-seconds and 2 million requests per month, which is roughly 100 hours of 1 GiB request
processing. Per-user traffic would have to be heavy to exceed it.

## Repo changes made during deployment

- `docs/audit/kestrel-cloudflare-hosting-analysis-2026-11-01.md` (analysis, new)
- `docs/audit/kestrel-cloud-run-deployment-2026-11-02.md` (this file, new)
- `.gitignore`: `vercel link` appended `.vercel` automatically. Harmless and arguably correct.

`vercel link` also created a gitignored `.vercel/` directory in the repo root.
