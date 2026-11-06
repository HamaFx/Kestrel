# Changelog

All notable changes to Kestrel are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-11-06

The first public open-source release of Kestrel, licensed under Apache 2.0.

Kestrel is a self-hosted, multi-user AI trading research workspace. It combines a
four-desk research committee with market structure, quantitative indicators,
journaling, alerts, and a plugin surface for backtesting, paper trading, and
Telegram.

### Added

- **Self-hosted multi-user workspace.** Next.js 16 PWA with React 19, installable
  on desktop and mobile, including offline shell, push notifications, and share
  target support.
- **Four-desk AI committee.** Technical, fundamental, risk, and sentiment desks
  run through Mastra workflows and synthesize a cited research opinion. Chat,
  single-desk, and comparison analysis modes are available.
- **Bring your own key (BYOK).** Eight first-party providers: Google Gemini,
  Anthropic, OpenAI, Groq, Mistral AI, OpenRouter, xAI, and DeepSeek. Keys are
  encrypted at rest with AES-256-GCM and never leave the server in plaintext.
- **Market data and structure.** BiQuote, Binance, Finnhub, Marketaux, FRED, and
  CFTC feeds behind a health-scored registry, with freshness and staleness
  metadata preserved on every read. Confirmed swing structure, previous
  day/week levels, session ranges, and an extensible indicator registry.
- **Research workspace.** Chat with live quotes and charts, watchlists, alerts,
  trading journal and analytics, economic calendar, news, and daily briefings.
- **Durable background worker.** pg-boss queues, scheduled jobs, optional
  SignalR and Binance tick streaming, and 1-minute candle aggregation.
- **Three official plugins.** Backtesting, Paper Trading, and Telegram Bot,
  built on the public plugin SDK.
- **PostgreSQL 16 + pgvector.** Drizzle ORM schema and migrations with forced
  row-level security and a dedicated non-bypass `kestrel_app` role for runtime
  traffic.
- **Deployment options.** Docker Compose stack with PostgreSQL, web app, worker,
  and backups; an optional Langfuse observability overlay; and a documented
  external-PostgreSQL profile.

### Security

- CSRF protection, security headers, per-user rate limits, account lockout, and
  encrypted provider credentials.
- Administrator or scheduler-secret authorization for cron routes.
- A daily AI budget cap enforced by default (`ENFORCE_BUDGET=1`,
  `MAX_DAILY_USD=5` per user).
- Write-only API key settings: stored keys are never decrypted into client
  payloads.
- Outbound URL validation for provider and web-search requests, with private
  address ranges blocked.
- Fail-closed migration and startup checks for multi-user and RLS deployments.

### Documentation

- `README.md` for product scope, quick start, and deployment profiles.
- `docs/configuration.md` for the environment contract.
- `docs/architecture/README.md` for system diagrams and data flow.
- `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, and `CODE_OF_CONDUCT.md` for
  contributors and operators.
- `DEPLOY.md` for production deployment and migration guidance.

---

## [0.0.0] - Historical pre-release

Development builds before the first public release. The application version is
independent of the workspace package versions.
