# Kestrel on Cloudflare: hosting analysis

Date: 2026-11-01
Scope: read-only analysis. No deployment, no code changes.
Tooling used: `wrangler 4.156.1` (authenticated), `vinext check`, live workerd probes against the local
`pgvector/pgvector:pg16` container.

## 0. Current deployment context (supplied by the operator, 2026-11-02)

| Piece         | Where it runs                             | Evidence                                                                                          |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Web app       | Vercel, free Hobby tier                   | `apps/web/vercel.json` sets a Vercel build command and ignored-build step                         |
| Worker daemon | A Google Cloud VM (`worker` service only) | `infra/cron-vm/docker-compose.free.yml`, 700 MB memory limit, e2-micro 1 GB RAM + 2 GB swap       |
| Database      | Supabase, external Postgres               | Reached over the network; `SUPABASE_CA_CERT` / pinned CA in `packages/db/src/connection/pools.ts` |

This matters more than anything else in this document, because **two of the three hosting problems are
already solved outside Cloudflare**:

- The database is already external. That was the one genuinely unfixable item, and it needs no action.
- The worker already runs on a real machine. That was the item that can never be a Worker, and it needs no
  action either. Moving it to Cloudflare Containers would take it from $0 to roughly $8/month.

**Only the web app is a candidate for Cloudflare compute.** If that is not required, the scope of this
document shrinks to sections 1, 3 and 6 (Shape A), which is free.

## 1. Verdict in one paragraph

Kestrel is **not** a Cloudflare-shaped application, and Cloudflare has no managed Postgres, so there is no
"point it at Cloudflare and deploy" path. The realistic outcome depends on one decision: run the existing
containers on **Cloudflare Containers** (low risk, days of work, roughly $21/month, no application
rewrite), or port the web app to **Workers via vinext** (high risk, weeks of work, blocked on `next-auth`,
a 108 MiB server bundle against a 64 MiB limit, and a per-request-connection rewrite of the data layer).
The background worker daemon can only ever be a Container or an external VM; it cannot be a Worker.

Recommended: **Containers for both apps, Cloudflare for DNS/CDN/WAF/Tunnel/Access, R2 for object storage,
Postgres stays external (Neon or Supabase) or moves behind a Cloudflare Tunnel.**

## 2. What Kestrel actually is (measured, not assumed)

| Area            | Fact                                                                                                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo        | pnpm 12.14 workspace + Turborepo. Node `>=22.22.2`.                                                                                                                                                                                                                    |
| Web app         | `apps/web`, Next.js 16.4 App Router, React 19, 35 pages, 7 layouts, **104 route handlers**, 22 loading and 11 error boundaries, PWA service worker generated at build time.                                                                                            |
| Worker daemon   | `apps/worker`, single long-lived Node 22 process. 15 core cron jobs + 3 plugin cron jobs, pg-boss consumers, optional SignalR + Binance WebSocket tick ingestion (`WORKER_ENABLE_TICK_STREAM=1`, off by default), health server on `:8081`, optional proxy on `:8082`. |
| Packages        | `ai` (Mastra 4-agent committee), `data` (6 external market-data providers), `db` (Drizzle + migrations + RLS), `indicators` (pure), `shared`, `plugin-sdk`, `config`, `test-utils`.                                                                                    |
| Plugins         | `backtesting`, `custom-agents`, `paper-trading`, `telegram-bot`. Bundled at boot.                                                                                                                                                                                      |
| Database        | PostgreSQL 16 + `pgvector` (required at query time, not just migration time). **54 Drizzle tables**, **122 migrations**, 7,182 lines of SQL, 255 indexes.                                                                                                              |
| Tenancy         | Postgres RLS on 35 tables via transaction-local `set_config('app.current_tenant', $1, true)`; roles `kestrel_app` (`NOBYPASSRLS`) and `hamafx_admin` (`BYPASSRLS`).                                                                                                    |
| Queues          | pg-boss schema `pgboss` (`backtest-run`, `backtest-sweep`, `candle-flush` + DLQs) plus two hand-rolled Postgres queues (`full_analysis_queue`, `persistence_outbox`).                                                                                                  |
| Object storage  | Supabase Storage, private bucket `chat-images`, reached over REST `fetch`. No local uploads, no `bytea` images.                                                                                                                                                        |
| External egress | BiQuote, Binance REST + WS, Finnhub, Marketaux, FRED, CFTC, 11 AI providers, Vercel AI Gateway, Langfuse, Telegram, Resend, web-push, healthchecks.io, GCP Secret Manager, rclone to B2.                                                                               |
| Local state     | None durable for the worker (all in Postgres). Web app has no writable disk need except `sharp` temp work and eval-dataset exports.                                                                                                                                    |

### Measured sizes (these matter for the Workers path)

| Measurement                  | Value                            | Cloudflare limit                            |
| ---------------------------- | -------------------------------- | ------------------------------------------- |
| Next.js standalone server JS | **108.2 MiB across 1,788 files** | 64 MiB uncompressed per Worker              |
| `.next/standalone` total     | 267 MiB (93 MiB `node_modules`)  | n/a                                         |
| `.next/static`               | 18 MiB                           | n/a                                         |
| `public/`                    | 5.1 MiB, 76 files                | Workers Static Assets: 100,000 files (Paid) |
| Env var names referenced     | **525**                          | 128 vars + secrets per Worker               |
| Route handlers               | 104 (all `runtime = 'nodejs'`)   | n/a                                         |
| Cron routes                  | 14                               | 250 Cron Triggers per account               |
| Worker daemon bundle         | 64 MiB                           | (runs in a Container, so not a limit)       |

## 3. Cloudflare product mapping

| Kestrel need                                  | Cloudflare product                                                                 | Verdict                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16 web app                            | Workers via **vinext** (now Cloudflare's recommended path) or the OpenNext adapter | **Port-scale work.** `vinext check` scores this repo 88% compatible.                                                             |
| Long-lived Node daemon                        | **Containers**                                                                     | **Works.** Run the existing `Dockerfile.worker` image almost unchanged.                                                          |
| Web app as a container                        | **Containers**                                                                     | **Works.** `Dockerfile` + `docker-entrypoint.sh` already do the right thing.                                                     |
| PostgreSQL 16 + pgvector                      | **Nothing on Cloudflare.** Hyperdrive is a proxy, not a database.                  | **Stays external**: Neon, Supabase, RDS, or self-hosted behind a Tunnel.                                                         |
| D1 as a Postgres replacement                  | D1 is SQLite                                                                       | **Impossible.** No pgvector, RLS, PL/pgSQL triggers, enums, `text[]`, `tsvector`, `FOR UPDATE SKIP LOCKED`, or multiple schemas. |
| Basin (formerly Data Platform)                | Iceberg/OLAP on R2                                                                 | **Wrong tool.** Analytics only, not OLTP.                                                                                        |
| Hot DB connection pooling                     | **Hyperdrive**                                                                     | Works, transaction mode, but see the caching warning in §5.5.                                                                    |
| Image / attachment storage                    | **R2**                                                                             | Clean swap. Both call sites already use REST `fetch`. No egress fees.                                                            |
| 14 web cron routes                            | **Cron Triggers**                                                                  | Works. Bearer `CRON_SECRET` is already how they authenticate.                                                                    |
| pg-boss queues                                | **Queues**                                                                         | Not a drop-in (see §5.8). Keep pg-boss in the Container.                                                                         |
| Durable multi-agent analysis                  | **Workflows**                                                                      | Good future fit for `full_analysis_queue`, but a rewrite.                                                                        |
| Redis packet cache / throttle                 | Workers KV or a Container-local Redis                                              | Optional feature, low priority.                                                                                                  |
| `sharp` image work                            | **Cloudflare Images** or `images.unoptimized`                                      | Needs a code change.                                                                                                             |
| Secrets                                       | **Secrets Store** / Worker secrets                                                 | Needed if going serverless.                                                                                                      |
| Ingress, TLS, WAF, rate limiting, bot defence | Cloudflare CDN/WAF                                                                 | Free win, use it either way.                                                                                                     |
| Private access to a self-hosted instance      | **Zero Trust Access** + **Tunnel**                                                 | Strong fit: Kestrel is a private multi-user tool.                                                                                |

## 4. Verified working (empirical evidence, not inference)

I ran a purpose-built probe **inside workerd** (the actual Workers runtime) against the local
`pgvector/pg16` database, reproducing Kestrel's exact data-layer pattern.

### 4.1 `postgres.js` + Drizzle bundle and run on workerd

```
Total Upload: 272.13 KiB / gzip: 56.94 KiB
```

`postgres@3.4.9` + `drizzle-orm@0.45.4` + `node:async_hooks`, with `prepare: false`, bundled and executed
successfully, returning `PostgreSQL 16.15`.

### 4.2 Row-level security enforces correctly under workerd

Using a reproduction of `packages/db/src/connection/scope.ts` (transaction + `set_config(..., true)`),
against a table with `ENABLE`/`FORCE ROW LEVEL SECURITY` and the same `tenant_isolation` policy shape:

```json
{
  "bootstrapRole": "hamafx (is_superuser=on)",
  "seeded": [{ "n": 2 }],
  "tenantASees": ["a-private-note"],
  "crossTenantWrite": "blocked: Failed query: INSERT INTO ... ('tenant-b', 'smuggled')",
  "nextTransactionSees": []
}
```

Three things are proven:

1. Tenant-scoped reads return only the tenant's rows.
2. A cross-tenant write is rejected by the `WITH CHECK` policy.
3. **The tenant GUC does not leak into the next transaction on the same pooled connection.**

This is the single most important result: Kestrel's transaction-local RLS design is compatible with
Hyperdrive's transaction-mode pooling, which `RESET`s connections between transactions.

### 4.3 Node crypto is a non-issue

Cloudflare documents `node:crypto` as **fully supported** in Workers, including ciphers. So
`packages/shared/src/encryption.ts` (AES-256-GCM, `pbkdf2Sync`, `randomBytes`), `bcryptjs` (pure JS),
`otplib`, `timingSafeEqual`, and HMAC signing all work. `argon2` is not supported but Kestrel does not use it.

### 4.4 Other Node APIs Kestrel needs are supported

`async_hooks` (`AsyncLocalStorage`, used for tenant scope), `buffer`, `net`, `tls` (partial), `stream`,
`process`, `path`, `zlib`, `events`, `timers`, `url`, `util` are all 🟢 in the Node compat matrix.

## 5. Blockers, ranked

### 5.1 `next-auth` is the flagged incompatibility (Workers path only)

`vinext check` on this repo:

```
Overall: 88% compatible (28 supported, 4 partial, 2 issues)
Issues to address:
  ✗ next-auth — relies on Next.js API route internals; consider migrating to better-auth
  ✗ __dirname / __filename — only in build scripts and tests, not runtime code
```

`next-auth@5.0.0-beta.32` is the auth spine: `src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts`,
`api/auth/[...nextauth]/route.ts`, credentials + TOTP + lockouts. The second issue is trivial (six build
scripts and one test file). The first is not: it is either a migration to `better-auth`, a spike to prove
Auth.js works under vinext anyway, or keeping the web app off Workers.

Note also that the **OpenNext adapter explicitly does not support Node.js middleware**, and this repo's
`proxy.ts` (Next 16 renamed middleware) is Node-runtime by default and does CSP nonces, CSRF
double-submit, and HMAC user-header signing. vinext reports `proxy.ts` as supported, so vinext is the
better target of the two.

### 5.2 Server bundle exceeds the Worker size limit

108.2 MiB of server JS vs a 64 MiB uncompressed Worker limit. The Next.js standalone trace is not what a
vinext build produces, so this is an indicator rather than a final verdict, but it is consistent with the
dependency graph: Mastra, OpenTelemetry, `shiki` (4.5), `three`, `lightweight-charts`, `quickjs-emscripten`
(plus its `.wasm`), `pino`, and 11 AI SDK providers. Expect real tree-shaking, provider-lazy-loading and
possibly a Worker + service-binding split.

### 5.3 525 env var names vs a 128-per-Worker limit

Most are optional or per-provider, and the required core is roughly 20. A feature-complete deployment,
however, plausibly approaches or exceeds 128. The long tail has to move to Secrets Store, KV, or the
database. Also note the five `NEXT_PUBLIC_*` values are **build-time inlined**, so they must exist at
build time in Workers Builds, not just at runtime.

### 5.4 Module-scope connection singletons are illegal in Workers

`packages/db/src/connection/pools.ts` caches pools on `globalThis.__kestrelDbPools`. Workers forbids
reusing an I/O object created in one request during a different request
("Cannot perform I/O on behalf of a different request"). Cloudflare's own Hyperdrive examples say to
create the client **inside the handler, not in global scope**. This is a data-layer rewrite: per-request
clients for the primary, replica, and admin pools, plus Mastra's `@mastra/pg` pool and `PgVector`.

Related: the Worker limit is **6 simultaneous connections waiting for response headers**. A cold start
opening several pools at once can trip it. Pool sizes must drop to 1 or 2 per isolate.

### 5.5 Hyperdrive query caching is a cross-tenant leak risk (if Hyperdrive is used)

This is the sharpest security finding. Hyperdrive caches eligible read-only queries **by default**
(`max_age` 60s, `stale_while_revalidate` 15s), keyed on query text. Cloudflare's own guidance:

> Use a cache-disabled Hyperdrive configuration for reads that must be fresh. Good examples include
> authentication, sessions, permissions, billing state, admin settings, and reads immediately after a write.

Because Kestrel's row visibility depends on session state (`app.current_tenant`) rather than on query
parameters, a cached `SELECT` could serve tenant A's rows to tenant B. **Any Hyperdrive config serving
this app must be created with `--caching-disabled`:**

```sh
wrangler hyperdrive create kestrel-db --connection-string="<URL>" --caching-disabled
```

Do not rely on the transaction wrapper alone to defeat the cache. Other Hyperdrive constraints that
matter here:

- Max query duration 60s (Kestrel's own timeouts are 8s web / 30s worker, so fine).
- Paid: ~100 origin connections per config. Free: ~20.
- "Not recommended to wrap multiple database operations in a single transaction" because the transaction
  pins a pooled connection. Kestrel's RLS design is transaction-per-unit-of-work, which is acceptable, but
  any long-lived scope (see §5.7) is not.

### 5.6 No writable filesystem

Workers exposes a virtual filesystem: `/bundle` is read-only (one file per bundled module) and `/tmp` is
writable but **unique per request and not persistent**. Consequences:

| File                                                         | What breaks                                                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/env.ts`                                    | Module-scope `existsSync`/`writeFileSync` of `.kestrel/dev-secrets.json`. Not on `/tmp` or `/bundle`, so it fails.                  |
| `apps/web/src/app/api/health/db/route.ts`                    | `readFileSync` of the Drizzle migration journal. Must be bundled as a module or replaced by a query.                                |
| `apps/web/src/app/api/admin/eval-datasets/export/route.ts`   | Writes to `DATASETS_DIR ?? /tmp/kestrel-datasets`. `mkdir` outside `/tmp` fails; `/tmp` does not persist.                           |
| `packages/ai/src/mastra-v2/storage/connection.ts`            | `mkdirSync` for the `file:./.kestrel/mastra.db` LibSQL fallback.                                                                    |
| `packages/ai/src/eval/*`, `diagnostics/trace-persistence.ts` | `writeFile` for dataset/report/trace artifacts.                                                                                     |
| QuickJS `.wasm`                                              | `next.config.mjs` uses `outputFileTracingIncludes` to copy the wasm to disk. On Workers it must be a bundled module import instead. |
| Plugin `SKILL.md` files                                      | Same `outputFileTracingIncludes` filesystem-path approach.                                                                          |

### 5.7 The 1-hour SSE stream and other long-lived work

`/api/market/stream` holds a request open for up to 60 minutes (1,200 iterations x 3s) polling prices
every 3 seconds. Workers allow unlimited HTTP wall time while the client stays connected, so the duration
is fine, but holding tenant-scoped DB work open for an hour would pin a Hyperdrive connection and exhaust
the pool. It needs to become stateless short polls, a Durable Object with alarms, or a WebSocket.

Also incompatible with a process-per-request model: the in-memory log streaming hub
(`api/admin/logs/stream`, dev-only), in-memory rate-limit counters, and the in-memory packet cache.

### 5.8 The worker daemon cannot be a Worker (any amount of porting)

It is a single long-lived Node process that combines four roles, and every one of them is outside the
Workers model:

- `node-cron` schedules with process-lifetime semantics (15 + 3 jobs, plus a 3-second poll loop).
- `pg-boss` consumers: DDL, polling supervision, `heartbeatSeconds`, DLQs, and transactional enqueue that
  shares the web request's Drizzle transaction (`packages/db/src/queue.ts`). Cloudflare Queues cannot
  participate in a Postgres transaction, so that atomicity guarantee is lost.
- `ws` + `@microsoft/signalr` 24/7 outbound WebSockets with custom reconnect ladders.
- `child_process`: `sd-notify` and `rclone` for Backblaze B2 dataset export.
- CPU budget: QuickJS backtest sweeps can run ~2,000s of sandbox time; the multi-agent committee job has a
  15-minute budget. Cron Triggers cap at 15 min wall and 30s CPU (<1h interval).
- `VACUUM ANALYZE` from application code (`packages/db/src/retention/vacuum.ts`) needs table ownership and
  cannot run inside a transaction block, which conflicts with transaction-mode pooling.
- Session-level `SET statement_timeout` on connect (fine on a direct TCP Container connection, not with
  per-request clients).
- Health endpoints `/health/live`, `/health/ready`, `/health/jobs`, `/health/idle`, `/health/dependencies`
  with bearer auth, consumed by autoheal and deploy scripts.

**Containers handle all of this with essentially zero code change.** A Container is a Firecracker microVM
running the image, with full TCP egress, a real filesystem, `SIGTERM` plus up to 15 minutes of grace, and
no 128-env-var or bundle-size limit. Kestrel's existing health endpoints and 60s drain map directly onto
Container health checks and `SIGTERM`.

One caveat: Containers **scale to zero on inactivity** (`sleepAfter` defaults to 10 minutes). An always-on
daemon needs either `onActivityExpired()` overridden to keep the instance alive, or a Cron Trigger that
pings the Durable Object every minute to refresh the inactivity timer. If `WORKER_ENABLE_TICK_STREAM=1`,
a continuously running instance is mandatory (a scaled-to-zero container cannot hold a 24/7 WebSocket).

### 5.9 Smaller items

| Item                      | Note                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sharp`                   | Dev dependency plus a dynamic import in `api/upload/route.ts`. Native binary; replace with Cloudflare Images or drop the re-encode, and set `images.unoptimized` or a Cloudflare loader. |
| `next/image`              | `remotePatterns` allows only `**.supabase.co` / `**.supabase.in`. Must be updated if storage moves to R2.                                                                                |
| `@opentelemetry/sdk-node` | Node-only; `initLangfuse()` in `instrumentation.ts`. Langfuse is opt-in and off by default, so it can be dropped or replaced with Workers Logs / Tail Workers.                           |
| `web-push`                | Uses Node `crypto` + `https` internals. Works only in a Container, or must be reimplemented.                                                                                             |
| `pino`                    | Custom `Writable` to `process.stdout`. `node:stream` is supported, but the custom destination and the log-stream hub need review.                                                        |
| `instrumentation.ts`      | Eager Mastra storage DDL (`initializeKestrelMastra()`) at boot. Per-isolate cold starts would run DDL repeatedly and threaten the 1s startup limit. Container: fine.                     |
| TLS pinning               | `resolveSslOptions()` pins the Supabase root CA and refuses insecure TLS in production. With per-request clients and Hyperdrive this logic must be revisited.                            |
| `DB_DISABLE_SSL`          | Guarded to non-production or `KESTREL_LOCAL_DOCKER=true`. Fine in a Container.                                                                                                           |
| Migration runner          | The entrypoint runs migrations at boot from `DIRECT_URL`, never a transaction pooler. Keep this on the Container path.                                                                   |
| `__dirname`               | Six build scripts and one test file. Trivial.                                                                                                                                            |

## 6. Three deployment shapes

### Shape A: Cloudflare in front of the current Docker stack (lowest risk, hours)

Cloudflare DNS + proxy + WAF + rate limiting + **Tunnel** to the existing `docker compose` host, optionally
gated by **Zero Trust Access**. Postgres, worker, and web stay exactly as they are.

- Code change: none. Add `X-Forwarded-*` handling review, ensure `NEXT_PUBLIC_APP_URL` and `AUTH_URL` use
  the public hostname, and confirm `trustHost: true` in `auth.config.ts` is acceptable.
- Cost: $0 to ~$5/month.
- Buys: real TLS, DDoS/WAF, bot defence, Cloudflare Access in front of a private research tool, and
  Cloudflare Ray IDs in logs.

### Shape B: Containers for both apps, Postgres external (recommended)

| Piece                  | Runs on                               | Notes                                                                                           |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Web app                | Container (`basic`: 1 GiB, 4 GB disk) | Existing `Dockerfile` almost as-is. A Worker proxies ingress.                                   |
| Worker daemon          | Container (`basic`)                   | Existing `Dockerfile.worker`. Keep `WORKER_MODE=docker`.                                        |
| Postgres 16 + pgvector | Neon / Supabase / RDS                 | Required. Hyperdrive optional (cache-disabled only) since Containers get direct TCP.            |
| Images                 | R2                                    | Swap `packages/data/src/adapters/storage.ts` and `packages/ai/src/media/chat-image-storage.ts`. |
| Crons                  | Container-internal (unchanged)        | No Cron Trigger migration needed.                                                               |
| Secrets                | Worker secrets + Container env        | Cache Container env vars in the Durable Object per the 5 KB / variable guidance.                |

- Code change: R2 adapter, image handling, and `next/image` remote patterns. Roughly days, not weeks.
- Cost estimate (Workers Paid $5 required):
  - Container memory is billed on **provisioned** GiB while running: 1 GiB x 730 h = 730 GiB-h, minus the
    included 25 GiB-h = 705 GiB-h = 2,538,000 GiB-s x $0.0000025 = **$6.35/month** per 1 GiB container.
  - Disk 4 GB x 730 h = 2,920 GB-h, minus 200 included = **$0.69/month**.
  - CPU is billed on **active** usage only; an idle-ish Node daemon at ~10% of 0.25 vCPU is roughly
    **$0.85/month**.
  - So roughly **$8/month per always-on `basic` container**, about **$21/month for both plus the plan**,
    before the database. A `standard-1` (4 GiB) always-on container is ~$27/month on memory alone, so stay
    on `basic` unless the tick stream needs more.
  - **For this deployment: about $13/month**, not $21. The worker stays on the free VM and the database
    stays on Supabase, so only the web app moves: $5 plan plus one `basic` container. Verify that `basic`'s
    1/4 vCPU is enough for Next.js SSR under real traffic; `docker-compose.yml` currently allows the web
    app 1 full CPU, so a busy instance may need a larger (more expensive) type.
- This is a cost increase over the current $0/month (Vercel Hobby + Supabase Free + free-tier VM). Be
  explicit about whether that is worth it.

### Shape C: Web app on Workers via vinext (highest risk, weeks)

Only worth it if you want per-request global scale and no servers. Required work, in dependency order:

1. Spike `next-auth` under vinext, or migrate to `better-auth`. Decide before anything else.
2. Rewrite `packages/db` to per-request clients; drop or relocate `globalThis` singletons; reduce pool
   sizes to fit the 6-simultaneous-connection limit; move `statement_timeout` to `SET LOCAL` inside the
   tenant transaction.
3. Hyperdrive with `--caching-disabled`, plus a second config if some reads can safely be cached.
4. Solve the 108 MiB bundle: lazy providers, split Workers behind service bindings.
5. Move the long tail of env vars out of the Worker.
6. Remove all runtime filesystem use; bundle the QuickJS `.wasm` and plugin `SKILL.md` files as modules.
7. Replace `sharp`; set `images.unoptimized` or a Cloudflare Images loader; update `remotePatterns`.
8. Move `VACUUM ANALYZE` and retention off the request path.
9. Rework the market SSE stream.
10. Move each cron route to a Cron Trigger.
11. Rework `instrumentation.ts` so DDL is not run per isolate.

The worker daemon still needs a Container in this shape. Completing it buys serverless web hosting at the
cost of a data-layer rewrite in the most security-sensitive part of the codebase.

## 7. Suggested order of work

1. **Decide the goal.** If the aim is "hosted on Cloudflare, one control plane, no rewrite", Shape B. If the
   aim is "anything Vercel can do, Cloudflare can do", Shape C, and accept it is a project.
2. **Move object storage to R2 first.** It is independent, low risk, and required by both B and C.
3. **Stand up the Postgres host.** Create the database, apply the 122 migrations with `DIRECT_URL`, provision
   `kestrel_app` and `hamafx_admin`, and confirm `current_user` is `kestrel_app` with `rolbypassrls = false`.
   Verify pgvector is recent enough for `hnsw.iterative_scan` and `hnsw.max_scan_tuples` (pgvector >= 0.8).
4. **Containerise the worker daemon.** Ship `Dockerfile.worker`, pin one always-on instance, wire the health
   endpoints, keep pg-boss and `node-cron` as they are.
5. **Put Cloudflare in front** (Shape A) and confirm auth callbacks, cookies, CSP nonces, and the CSRF
   double-submit all still work behind the proxy. This is a genuine risk area: `proxy.ts` sets a per-request
   CSP nonce and an HMAC-signed `x-user-id-sig`.
6. **Move the web app to a Container**, or start the vinext spike if going for Shape C.
7. **Only then** consider Hyperdrive, Cron Triggers, Queues, or Workflows as optimisations.

## 8. Open questions to resolve before committing

1. Does Auth.js v5 actually fail under vinext, or is the check conservative? Needs a spike, not a report.
2. What does a real vinext production build of `apps/web` weigh? The 108 MiB figure is a Next standalone
   trace, not a vinext bundle.
3. Which Postgres host, and does it ship pgvector >= 0.8 plus the ability to create `BYPASSRLS` roles?
   `hamafx_admin` requires role-creation privileges, which some managed providers restrict.
4. Is Cloudflare Access acceptable UX for a multi-user app, or does it need the app's own login page?
5. Cost ceiling. Shape B is ~$21/month plus the database against today's $0.
6. Does the deployment want the tick stream (`WORKER_ENABLE_TICK_STREAM=1`)? It changes the container from
   "cron-driven" to "must never sleep", and it is off by default for good reason.

## 9. Appendix: evidence commands

```sh
wrangler --version                 # 4.156.1
wrangler whoami                    # authenticated; account REDACTED_CLOUDFLARE_ACCOUNT
wrangler hyperdrive --help         # transaction-mode pooling, create/update/list
wrangler containers --help         # build/push/instances/ssh
wrangler workflows --help          # durable multi-step execution
wrangler queues --help             # queue + consumer management
wrangler basin sql --help          # Iceberg/OLAP, not OLTP
wrangler d1 --help                 # SQLite, ruled out

cd apps/web && npx vinext check     # 88% compatible; next-auth + __dirname flagged

# workerd probe: postgres.js + Drizzle + RLS against local pgvector/pg16
npx wrangler@4 deploy --dry-run    # Total Upload: 272.13 KiB, nodejs_compat default
npx wrangler@4 dev                 # probe executed inside workerd, RLS enforced
```

Measured locally: `.next/standalone/apps/web/.next/server` = 108.2 MiB in 1,788 JS files;
`.next/standalone` = 267 MiB; `public/` = 5.1 MiB in 76 files; 525 distinct `process.env.*` names;
104 route handlers; 14 cron routes; 54 tables; 122 migrations.

The temporary probe project lives outside the repo at `/tmp/opencode/cf-driver-test` and its database
artifacts (schema `cf_probe_rls`, role `cf_probe_role`) were dropped after the run.
