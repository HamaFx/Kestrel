# Kestrel Docker image
# Multi-stage build: deps → build → runtime
# Uses Next.js standalone output for minimal final image.

# L-3: Base image pinned to a specific minor version for reproducible builds.
# Update to the latest supported Node.js 22.x minor periodically via Dependabot.
FROM node:22.13.0-slim@sha256:87608ec5109795be954baa2f5b0b6da1911423d8b44b58fecda31f81d28bfc0f AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────
FROM base AS deps
# Package.json files must be copied to their correct subdirectory paths so
# pnpm can resolve the workspace. Docker's multi-source COPY flattens files,
# so each package.json needs its own COPY with the matching dest dir.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/ai/package.json packages/ai/
COPY packages/config/package.json packages/config/
COPY packages/data/package.json packages/data/
COPY packages/db/package.json packages/db/
COPY packages/indicators/package.json packages/indicators/
COPY packages/shared/package.json packages/shared/

# OPT-2: pnpm fetch + install pattern. fetch downloads all tarballs into the
# store using only the lockfile (no package.json resolution); install --offline
# then links from the store. This is faster than a plain install and the
# cache mount persists the store across builds.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# OPT-6: Prepare the runtime migrator's production dependency tree here, in
# the deps stage, where it only re-runs when package.json/lockfile change.
# Next.js standalone tracing does not see this separately-run .mjs script.
# Placing it after COPY . . in the builder stage cost ~35s per rebuild.
RUN pnpm --filter=@kestrel/db deploy --prod /runtime/db

# ── Builder ───────────────────────────────────────────────
FROM base AS builder
# OPT-3: --link creates node_modules as a separate reusable layer instead of
# copying files into the builder's layer. This avoids the 68s copy seen with
# a plain COPY --from=deps.
COPY --link --from=deps /app/node_modules ./node_modules
COPY --link --from=deps /app/pnpm-lock.yaml ./
COPY --link --from=deps /runtime/db ./runtime/db
COPY --link . .

# Build only the web app (Turborepo handles transitive deps).
# Explicitly neutralize local legacy-auth settings during image creation;
# runtime authentication is still enforced by auth.config.ts/middleware.
# OPT-4: Cache turbo's .next and .turbo output across rebuilds so source-only
# changes skip recompiling unchanged packages.
RUN --mount=type=cache,id=turbo-web,target=/app/.turbo \
    --mount=type=cache,id=next-web,target=/app/apps/web/.next/cache \
    AUTH_MODE=normal pnpm turbo run build --filter=@kestrel/web...

# ── Runner ────────────────────────────────────────────────
FROM base AS runner
ARG DEPLOYED_SHA=unknown
LABEL org.opencontainers.image.title="Kestrel web" \
      org.opencontainers.image.source="https://github.com/HamaFx/Kestrel" \
      org.opencontainers.image.revision="${DEPLOYED_SHA}" \
      org.opencontainers.image.version="${DEPLOYED_SHA}"
# P4: postgresql-client was removed — the runtime migrator uses the
# 'postgres' npm package (in runtime-migrate/node_modules), not the psql CLI.
# This saves ~50MB and reduces the attack surface.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# OPT-5: --chown on each COPY instead of a blanket chown -R (saves ~58s).
# --link keeps these as separate layers (no copy into runner's layer).
# --chown uses numeric UID/GID (1000:1000 = node user) because --link creates
# a separate layer where the named user isn't resolvable from /etc/passwd.
# Copy Next.js standalone output
COPY --link --chown=1000:1000 --from=builder /app/apps/web/.next/standalone ./
COPY --link --chown=1000:1000 --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --link --chown=1000:1000 --from=builder /app/apps/web/public ./apps/web/public

# Copy drizzle migrations and the runtime migrator for auto-migrate on boot.
COPY --link --chown=1000:1000 --from=builder /app/packages/db/drizzle ./packages/db/drizzle
COPY --link --chown=1000:1000 --from=builder /app/packages/db/drizzle.config.ts ./packages/db/drizzle.config.ts

# Keep migrator dependencies isolated from Next.js standalone's traced tree.
# ESM resolves these packages from the migrator's local node_modules.
COPY --link --chown=1000:1000 --from=builder /app/runtime/db/node_modules ./runtime-migrate/node_modules
COPY --link --chown=1000:1000 --from=builder /app/apps/web/scripts/migrate-runtime.mjs ./runtime-migrate/migrate-runtime.mjs
COPY --link --chown=1000:1000 --from=builder /app/apps/web/scripts/wait-for-db.mjs ./runtime-migrate/wait-for-db.mjs

# Copy entrypoint
COPY --link --chown=1000:1000 apps/web/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Run the web server as an unprivileged user. The entrypoint only reads
# migrations and starts Next.js, so it does not need root privileges.
USER node

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
