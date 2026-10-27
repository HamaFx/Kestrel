# Kestrel Cloud Deployment Guide ($0/Month — No GitHub Actions Required)

Kestrel supports two **$0/month** cloud worker setups alongside **Vercel Hobby** (web app) and **Supabase Free** (PostgreSQL + `pgvector`), with **zero dependency on GitHub Actions**:

| Feature              | Option A: Botkeep Founder Free (Recommended)                                | Option B: Google Cloud Always Free (`e2-micro`)           |
| :------------------- | :-------------------------------------------------------------------------- | :-------------------------------------------------------- |
| **Monthly Cost**     | **$0 / month** (No expiry)                                                  | **$0 / month** (`us-central1`, `us-east1`, or `us-west1`) |
| **RAM**              | **2 GB RAM** (shared across up to 5 slots)                                  | **1 GB physical RAM** + **2 GB swapfile**                 |
| **CPU**              | **1.5 vCore**                                                               | **2 shared vCPUs** (`0.25` baseline, burstable)           |
| **Storage**          | **2 GB total storage** (slim build uses **~180 MB**)                        | **Up to 30 GB Standard Persistent Disk**                  |
| **Setup Difficulty** | **Easiest** — paste `.env.botkeep` + 1 startup command                      | **Moderate** — requires SSH + running 1 bash script       |
| **Crons & Jobs**     | Runs all heavy jobs + pokes all 9 Vercel `/api/cron/*` routes automatically | Runs all heavy jobs + host/in-process light crons         |

---

## Step 1: Generate Your Cloud Secrets (1 Command)

From your local computer (or any terminal with Node.js), run:

```bash
node scripts/deploy-cloud.mjs \
  --db="postgres://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres" \
  --url="https://hamafx-ai.vercel.app"
```

This creates two gitignored files with matching secrets:

- **`.env.botkeep`** — ready to paste into **Botkeep** (or `/opt/hamafx/.env` on Google Cloud).
- **`.env.vercel`** — ready to paste into **Vercel → Project Settings → Environment Variables**.

> **Note:** After logging into your Kestrel web app as Admin, go to **`/admin` → `AI & Platform`** to paste your Gemini / AI provider API key once in the UI. It is encrypted with `ENCRYPTION_SECRET` in Postgres so both Vercel and the Worker share it automatically.

---

## Step 2A: Deploy Worker on Botkeep Founder Free (2 GB RAM / 2 GB Storage)

Because Botkeep Founder Free gives you **2 GB total storage**, do **not** run a full monorepo `pnpm install` (which downloads Next.js and Playwright for the web app and uses ~1.5 GB). Instead, use Kestrel's slim launcher (`scripts/botkeep-start.mjs`), which installs only `@kestrel/worker`, bundles it, and prunes the store so total disk usage stays around **~180 MB**.

1. Create a Node.js server slot in [Botkeep](https://botkeep.cloud/) connected to your GitHub repo (`HamaFx/Kestrel`, branch `main`).
2. Copy the variables from **`.env.botkeep`** into your Botkeep server's **Environment Variables** (at minimum: `DATABASE_URL`, `ENCRYPTION_SECRET`, `PRODUCTION_URL`, and `CRON_SECRET` — the launcher auto-derives the rest if omitted).
3. Set the **Startup Command** to:
   ```bash
   node scripts/botkeep-start.mjs
   ```
   _(Or `bash botkeep.sh`)_
4. Optional auto-pull on restart: set `BOTKEEP_PULL_ON_START=1` in Botkeep Environment Variables so restarting the server in Botkeep automatically pulls the latest commit from `main` and rebuilds if needed.

---

## Step 2B: Deploy Worker on Google Cloud Always Free (`e2-micro`)

If you prefer running on Google Cloud's **$0/month Always Free** tier (or switching your existing `hamafx-cron` VM from `e2-medium` to `e2-micro` to save ~$15/month):

1. Create or resize your GCE instance in `us-central1-a` to machine type **`e2-micro`** with a **20–30 GB Standard Persistent Disk (`pd-standard`)** (up to 30 GB `pd-standard` is free on GCP Always Free).
2. SSH into the VM and run the 1-command free-tier provisioner (which sets up a **2 GB swapfile** so `1 GB` RAM never runs out of memory):
   ```bash
   sudo bash /opt/hamafx/app/infra/cron-vm/provision-gcp-free.sh
   ```
3. Paste your `.env.botkeep` contents into `/opt/hamafx/.env` and start the memory-bounded worker container:
   ```bash
   sudo docker compose \
     -f /opt/hamafx/app/infra/cron-vm/docker-compose.free.yml \
     --env-file /opt/hamafx/.env \
     up -d --build
   ```

---

## BYOK and local spend budgets

No payment gateway, subscription, or credit wallet is required. Provide user
BYOK keys through `/settings/models`; model spend is tracked locally in USD.

- Set `MAX_DAILY_USD` for the default per-user daily ceiling.
- Budget enforcement is off by default (ledger-only). Set
  `ENFORCE_BUDGET=true` to reject over-cap turns with HTTP 429.
- `ai_budget_reservations` and `daily_ai_spend` are swept by the standard
  retention job; no billing cron or webhook is needed.

---

## Post-deploy verification (automatic)

The optional `post-deploy-smoke` workflow verifies a live deployment:

- **After each Vercel production deploy** — Vercel posts GitHub deployment
  events, and the workflow verifies the deployed URL immediately.
- **Daily (06:41 UTC)** — a scheduled run re-checks the configured target as a
  safety net for self-hosted/Docker deployments that publish no GitHub events.
- **Manual** — `gh workflow run post-deploy-smoke`, or locally:
  `PRODUCTION_URL=https://… pnpm verify:production`.

It runs `scripts/verify-production.mjs` read-only: web health
(`/api/health/public`), the worker `/health` and SLO alert contract when
configured, and migration status when a direct database URL is configured. It
never applies migrations. A failed run shows up in the Actions tab (GitHub
notifies watchers). Roll back with Vercel Instant Rollback, or by redeploying
the previous image tag (`scripts/docker-prune-safe.mjs` keeps 7 days of tags).

One-time setup — GitHub → **Settings → Secrets and variables → Actions**:

| Name                          | Kind     | Purpose                                                                        |
| :---------------------------- | :------- | :----------------------------------------------------------------------------- |
| `KESTREL_PRODUCTION_URL`      | Variable | e.g. `https://hamafx-ai.vercel.app`; falls back to the Vercel event URL.       |
| `KESTREL_WORKER_HEALTH_URL`   | Variable | Only if the worker health port is reachable from runners (private by default). |
| `KESTREL_WORKER_HEALTH_TOKEN` | Secret   | Bearer token for the worker health check.                                      |
| `KESTREL_CRON_SECRET`         | Secret   | Enables the `/api/health/alerts` SLO contract check.                           |
| `KESTREL_DIRECT_URL`          | Secret   | Supabase direct (non-pooler) connection for the migration-status check.        |

Until a production URL is configured (variable or deployment event), the
workflow exits with a notice instead of failing — the $0 deployment path does
not depend on it.

## Where typechecking runs

`pnpm turbo run typecheck` (the Rust `tsrs` compiler) is the type gate: CI runs
it on every PR. Application builds — `next build` and the web Docker builder —
skip Next's duplicate built-in typecheck; the Docker build runs the same
`turbo run typecheck` gate explicitly before compiling.
