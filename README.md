<div align="center">

<img src="docs/assets/kestrel-logo.png" alt="Kestrel — kestrel bird mark" width="420" style="max-width: 100%">

# Kestrel

### Your self-hosted AI copilot for gold, forex, and crypto research.

Chat with market data, technical structure, macro context, risk math, journals, alerts, and multi-agent analysis — using **your own AI provider keys** and your own infrastructure.

<p>
  <a href="https://github.com/HamaFx/Kestrel/actions/workflows/ci-fast.yml"><img src="https://img.shields.io/github/actions/workflow/status/HamaFx/Kestrel/ci-fast.yml?branch=main&style=flat-square&label=CI" alt="CI status"></a>
  <a href="https://github.com/HamaFx/Kestrel/blob/main/LICENSE"><img src="https://img.shields.io/github/license/HamaFx/Kestrel?style=flat-square" alt="Apache 2.0 license"></a>
</p>

</div>

> **OSS release boundary:** The public release is currently a **single-user, self-hosted preview**. BYOK is enabled by default. Shared multi-user PostgreSQL, open registration, and runtime RLS mode are intentionally disabled until tenant isolation is complete. See [the security boundary](#-important-oss-boundary).

> **Trading disclaimer:** Kestrel is a research and workflow tool, not financial advice, a broker, or an automated trading system. Market data can be delayed or wrong. Always verify information independently and trade at your own risk.

---

## What is Kestrel?

Kestrel turns a chat window into a market-research workspace for gold (`XAUUSD`), a canonical forex catalog, supported Binance crypto pairs, analysis, risk planning, journaling, alerts, and review. It is self-hosted first: you control the deployment, database, encryption secret, and AI provider configuration.

The supported public deployment profiles are:

| Profile | Database | Worker | Intended use |
| --- | --- | ---: | --- |
| **Simple** | Embedded PGlite | No | Local development and evaluation |
| **Docker** | PostgreSQL 16 + pgvector | Yes | Complete single-user self-hosting |
| **External PostgreSQL** | Operator-managed PostgreSQL | Optional | Advanced single-user deployments |
| **Vercel + GCE** | Maintainer infrastructure | Yes | Kestrel’s own deployment; not the generic OSS path |

Shared multi-user/RLS hosting is not supported by the public release.

---

## Quick start

### Prerequisites

- [Node.js 22.13+](https://nodejs.org/)
- [pnpm 9+](https://pnpm.io/installation)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) only for Docker mode

### Recommended setup

```bash
git clone https://github.com/HamaFx/Kestrel.git
cd Kestrel
pnpm setup
```

The wizard can select Simple or Docker mode, generate local secrets, preserve existing configuration, run health checks, and optionally launch the app. It does not collect AI credentials in the terminal; configure BYOK after the first login.

```bash
pnpm setup --dry-run
pnpm setup --mode=simple --yes
pnpm setup --json
```

Open <http://localhost:3000>, register the first owner account, complete onboarding, and add an AI provider key under **Settings → API Keys**.

### Manual commands

```bash
# Simple/PGlite
pnpm install
pnpm dev:local

# Docker/PostgreSQL + worker
./docker/init-secrets.sh
docker compose up -d --build
```

The default Compose file binds application and database ports to localhost. If you expose the app through a reverse proxy, configure TLS, firewall rules, a secure hostname, and backups first. See [OPEN_SOURCE_DEPLOYMENT_MATRIX.md](OPEN_SOURCE_DEPLOYMENT_MATRIX.md).

---

## BYOK and external services

Kestrel does not bundle AI access. Provider keys are entered per user and encrypted at rest with `ENCRYPTION_SECRET`. The server decrypts a key only when it needs to call that provider.

Market-data, AI, storage, email, Telegram, Sentry, Langfuse, billing, and health-monitoring integrations are optional and have independent pricing, privacy policies, rate limits, and licensing terms. Review each provider’s current terms before enabling it or redistributing data.

Telemetry is disabled by default. If Sentry or Langfuse is enabled, review prompt/output capture and retention settings before using sensitive data.

**Never commit** `.env`, `.env.local`, `.kestrel/`, provider keys, database URLs, certificates, or cloud service-account files.

---

## Important OSS boundary

Fresh public deployments are intentionally single-user:

```text
OSS_SINGLE_USER_MODE=1
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
```

Do not expose one instance to unrelated users. Do not enable multi-user or RLS flags manually and treat that as supported tenancy. The repository contains experimental tenant/RLS infrastructure, but complete isolation across all application, worker, cache, memory, export, sharing, notification, billing, and telemetry paths has not been proven. An independent security review has not been performed.

---

## Architecture

Kestrel is a pnpm/Turborepo monorepo:

```text
apps/web       Next.js 16 PWA, Auth.js, chat, API routes, UI
apps/worker    persistent Node.js worker, feeds, candles, jobs, health server
packages/ai    Mastra agents/workflows, typed tools, routing, memory
packages/data  market adapters, providers, failover, caching
packages/db    Drizzle schema, migrations, PostgreSQL/PGlite clients
packages/indicators technical indicators and market structure
packages/shared schemas, environment validation, encryption, logging
packages/test-utils test factories, mocks, and Vitest helpers
```

The runtime is split into a web application and a persistent worker. Docker mode runs PostgreSQL/pgvector, web, worker, and a local logical-backup service. The worker’s canonical production health endpoints are `/health/live` and `/health/ready`; bind port 8081 to localhost or a private network unless you intentionally protect it with firewall rules and `WORKER_HEALTH_TOKEN`.

For the verified deployment matrix and operational caveats, read [OPEN_SOURCE_DEPLOYMENT_MATRIX.md](OPEN_SOURCE_DEPLOYMENT_MATRIX.md), [configuration.md](docs/configuration.md), [troubleshooting.md](docs/troubleshooting.md), [architecture.md](docs/architecture.md), [release.md](docs/release.md), and [OPEN_SOURCE_READINESS_CURRENT.md](OPEN_SOURCE_READINESS_CURRENT.md).

---

## Development and testing

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm turbo run test -- --run
pnpm build
```

Additional checks used for release review:

```bash
pnpm check:oss-release
pnpm check:p0-release
pnpm check:p3-release
pnpm check:route-security
pnpm check:env-contract
pnpm check:release-archive
pnpm check:dependency-report
pnpm check:single-user-release
```

The full Vitest suite currently passes. The PostgreSQL RLS test is skipped unless explicitly enabled with disposable PostgreSQL credentials; PGlite cannot prove PostgreSQL RLS, roles, grants, or pgvector behavior.

For E2E tests, start the app first and run:

```bash
pnpm test:e2e
```

AI behavior requires a configured provider unless you are running the deterministic market-data offline mode (`KESTREL_OFFLINE_MODE=1`).

---

## Documentation map

| Goal | Start here |
| --- | --- |
| Install locally | [Quick start](#quick-start) and [OPEN_SOURCE_DEPLOYMENT_MATRIX.md](OPEN_SOURCE_DEPLOYMENT_MATRIX.md) |
| Configure the app | [Configuration reference](docs/configuration.md) |
| Troubleshoot problems | [Troubleshooting guide](docs/troubleshooting.md) |
| Understand the system | [Architecture guide](docs/architecture.md) |
| Understand deployment support | [OPEN_SOURCE_DEPLOYMENT_MATRIX.md](OPEN_SOURCE_DEPLOYMENT_MATRIX.md) |
| Understand current readiness | [OPEN_SOURCE_READINESS_CURRENT.md](OPEN_SOURCE_READINESS_CURRENT.md) and [OPEN_SOURCE_READINESS_FINDINGS.md](OPEN_SOURCE_READINESS_FINDINGS.md) |
| Secure a deployment | [SECURITY.md](SECURITY.md) |
| Contribute | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Report a vulnerability | [SECURITY.md](SECURITY.md) |
| Understand the maintainer topology | [infra/cron-vm/](infra/cron-vm/) and [AGENTS.md](AGENTS.md) |

The architecture HTML/JSON files under `docs/` are static informational snapshots, not runtime assets and not generated during builds.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), use the existing package boundaries and validation patterns, and run the checks above before opening a pull request. Database changes require a new idempotent Drizzle migration; never edit an applied migration or use `drizzle-kit push` against production.

---

## License

Kestrel is released under the [Apache License 2.0](LICENSE). Third-party providers, market-data services, charting services, fonts, images, and AI models have their own terms.

<div align="center">

**Built for better market research — not blind certainty.**

</div>
