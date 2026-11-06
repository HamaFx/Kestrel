# Security Policy

Kestrel is an open-source, self-hosted multi-user AI trading research platform. Because Kestrel handles Bring-Your-Own-Key (BYOK) LLM credentials, market data provider keys, and multi-tenant trading records, security is a core architectural invariant.

## Supported Versions

Security patches are released on the latest `0.1.x` series tracking `main`:

| Version | Supported          |
| :------ | :----------------- |
| `0.1.x` | :white_check_mark: |
| `< 0.1` | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

1. **GitHub Private Vulnerability Reporting (Preferred):** Open a private advisory at **[github.com/HamaFx/Kestrel/security/advisories/new](https://github.com/HamaFx/Kestrel/security/advisories/new)**.
2. **What to Include:**
   - Affected package(s) and file path(s) (for example, `packages/db/src/connection/scope.ts` or `apps/web/src/proxy.ts`).
   - Deployment profile (`Docker Compose` or `Vercel + Supabase`).
   - Minimal reproduction steps or proof-of-concept request/payload.
   - Impact assessment (for example, cross-tenant RLS bypass, SSRF, XSS, or secret exposure).
3. **Response Timeline:**
   - **Acknowledgment:** Within 48 hours of submission.
   - **Triage & Remediation Plan:** Within 5 business days.
   - **Coordinated Disclosure:** Once a patch lands on `main` and a release tag is published.

## Built-In Security Architecture

```
+------------ [ SECURITY BOUNDARIES ] ------------+
|                                                 |
| ●  1. edge proxy     csrf + csp nonce + hmac id |
| │                                               |
| ●  2. postgres rls   kestrel_app (nobypassrls)  |
| │                                               |
| ●  3. byok vault     aes-256-gcm + write-only   |
| │                                               |
| ●  4. ai guardrails  ssrf + injection + 4/4 gate|
| │                                               |
| ○  5. wasm sandbox   quickjs 32mb / 2s cpu cap  |
+-------------------------------------------------+
```

- **PostgreSQL Row-Level Security (RLS) Isolation (`@kestrel/db`):**
  - Application traffic (`DATABASE_URL`) connects exclusively as the non-superuser `kestrel_app` role (`LOGIN`, `NOBYPASSRLS`).
  - Every tenant-scoped request opens a transaction via `withUserTenant(userId, ...)` or `withUserTenantRO(userId, ...)`, binding `app.current_tenant_id` and `app.current_user_id` locally to that transaction. Unscoped queries fail closed and return zero rows.
  - Cross-tenant background jobs (`@kestrel/worker`) use `ADMIN_DATABASE_URL` (`hamafx_admin`, `BYPASSRLS`) only for tenant discovery before scoping per-user work through `withUserTenant`.
- **AES-256-GCM BYOK Secret Encryption (`@kestrel/shared`):**
  - User API keys (OpenAI, Gemini, Anthropic, DeepSeek, Groq, xAI, OpenRouter) and plugin secrets (such as Telegram Bot tokens) are encrypted at rest using AES-256-GCM with `ENCRYPTION_SECRET`.
  - The `/settings/api-keys` UI is strictly write-only: decrypted keys never cross the React Server Component (RSC) boundary into client state or HTML payloads.
- **Request Ingress, CSRF & Route Guards (`@kestrel/web`):**
  - `apps/web/src/proxy.ts` enforces CSRF origin checks on mutating methods, attaches per-request CSP nonces, strips spoofed client headers, and signs `x-user-id` with `x-user-id-sig` (HMAC-SHA256).
  - Static CI guard `scripts/check-route-security.mjs` verifies that every `/api/**` route binds to `withAuth`, `withAdminAuth`, or `withCronAuth`.
- **AI Prompt-Injection, SSRF & Mutation Safety (`@kestrel/ai`):**
  - Outbound URLs are validated by `assertSafeOutboundUrl` (`packages/shared/src/runtime/safe-url.ts`), blocking RFC 1918 private networks, loopback, link-local metadata endpoints (`169.254.169.254`), IPv4-mapped IPv6 (`::ffff:`), and NAT64 (`64:ff9b:`) literals.
  - External news and web-search snippets pass through `external-content-screen.ts` before entering model context.
  - Chat and plugin write tools (`set_alert`, `log_journal`, `paper_place_order`, `paper_close_position`) cannot execute silently; they emit HMAC-signed confirmation cards requiring explicit user approval in the UI.
- **Sandboxed Strategy Execution (`@kestrel/plugin-backtesting`):**
  - User-authored and AI-generated JavaScript strategies execute inside a WebAssembly QuickJS isolate (`quickjs-emscripten`) with zero filesystem/network I/O, a 32 MB memory ceiling, and a 2,000 ms CPU interrupt timer.

## Self-Hosting Operator Responsibilities

Running Kestrel safely in production requires the operator to maintain the following boundaries:

1. **Generate Strong Secrets:** Always generate `AUTH_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`, and `POSTGRES_APP_PASSWORD` using `./docker/init-secrets.sh` or `pnpm setup`. Never reuse example values.
2. **Back Up `ENCRYPTION_SECRET` Off-Host:** Database backups (`pg_dump`) contain AES-256-GCM ciphertext for stored BYOK keys. Without the matching `ENCRYPTION_SECRET`, encrypted keys in a restored backup cannot be recovered.
3. **Keep Registration Mode Intentional:** `REGISTRATION_MODE=first_user` (the default) promotes the first registered account to `admin` and closes public sign-ups. If you set `REGISTRATION_MODE=open` on a public instance, keep `ALLOW_SHARED_OPERATOR_KEYS=0` and `ENFORCE_BUDGET=1` (`MAX_DAILY_USD=5`) so public users cannot spend operator-level AI keys.
4. **Keep Worker Health Ports Private:** Port `8081` (`/health/*`) and port `8082` (`/biquote`) on `@kestrel/worker` are internal operational endpoints protected by `WORKER_HEALTH_TOKEN` and `BIQUOTE_PROXY_TOKEN`. Do not expose them directly to the public internet.
