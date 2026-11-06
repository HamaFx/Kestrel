# Support

Need help installing, configuring, or operating your self-hosted **Kestrel** instance? Start with the resources below.

## Documentation & Self-Service Guides

1. **[Quickstart & Overview (`README.md`)](README.md)** — 60-second Docker Compose setup, local development, and feature overview.
2. **[Deployment Guide (`DEPLOY.md`)](DEPLOY.md)** — Production deployment instructions for Docker Compose and Vercel + Supabase + Worker.
3. **[Configuration Reference (`docs/configuration.md`)](docs/configuration.md)** — Complete reference for environment variables, PostgreSQL RLS roles (`kestrel_app` / `hamafx_admin`), BYOK budgets, and worker health probes.
4. **[Architecture Atlas (`docs/architecture/README.md`)](docs/architecture/README.md)** — C4 container maps, 4-Desk AI Committee pipeline, market-data failover, and plugin internals.

## Diagnostic Commands

Before opening an issue, run the built-in verification scripts from the repository root:

```bash
# Verify local environment variables and database connectivity
pnpm verify:local

# Verify a live production deployment (read-only health & migration checks)
PRODUCTION_URL=https://your-kestrel-domain.example.com pnpm verify:production
```

## Opening an Issue

- **Bug Reports:** Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.yml) and include your OS, Node.js/Docker versions, deployment profile, and redacted log output. Never paste real API keys, `AUTH_SECRET`, or `ENCRYPTION_SECRET` into an issue.
- **Feature Requests:** Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml) to propose new indicators, data providers, or workflow enhancements.
- **Security Vulnerabilities:** Do **not** open a public issue. Follow the private disclosure process in [`SECURITY.md`](SECURITY.md).
