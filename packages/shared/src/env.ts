/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Server-only environment validation. Imported at boot in apps/web (route
// handlers + middleware) and in any package that touches secrets.
//
// Every variable here MUST also appear in `.env.example` at the repo root.
// Keep this file the single source of truth — never re-validate elsewhere.
//
// Split by domain group: the zod groups live in `./env/schema/*`, the DB-URL
// resolvers in `./env/database-url`, and the AI picker in `./env/ai-env`. This
// entry keeps the composed `ServerEnvSchema` (and the DB group it composes)
// plus every re-export, so `@kestrel/shared/env`, `./env` and the barrel keep
// resolving exactly as before.

import { z } from 'zod';

import { AiEnv } from './env/schema/ai';
import { AuthEnv } from './env/schema/auth';
import { CacheEnv, NotifyEnv, ProvidersEnv, PublicEnv } from './env/schema/infra';
import { RuntimeEnv } from './env/schema/runtime';

// We accept either DATABASE_URL or POSTGRES_URL for app traffic — the Supabase
// Vercel integration writes POSTGRES_URL (transaction pooler, prepare-statement-safe
// when the client is configured with `prepare: false`). Phase 3 adds DIRECT_URL /
// POSTGRES_URL_NON_POOLING for migrations, backups, and other session-bound tasks.
//
// Declared in this entry (not in `./env/schema/*`) because the repo's
// `.env`-contract checker (`scripts/check-env-contract.mjs`) asserts the direct
// migration URL variables against this file. Direct/session-bound URLs:
// DIRECT_URL (preferred) or POSTGRES_URL_NON_POOLING; the resolvers that consume
// them live in `./env/database-url`.
const DbEnv = z
  .object({
    DATABASE_URL: z.url().optional(),
    POSTGRES_URL: z.url().optional(),
    DIRECT_URL: z.url().optional(),
    POSTGRES_URL_NON_POOLING: z.url().optional(),
    /** PF-15: Read-only replica URL for read-heavy queries. */
    DATABASE_URL_REPLICA: z.url().optional(),
    SUPABASE_CA_CERT: z.string().optional(),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
    /** Separate non-superuser connection for cross-tenant worker/cron jobs. */
    ADMIN_DATABASE_URL: z.url().optional(),
  })
  .refine((v) => Boolean(v.DATABASE_URL || v.POSTGRES_URL), {
    path: ['DATABASE_URL'],
    error: 'Either DATABASE_URL or POSTGRES_URL must be set',
  });

// `merge()` doesn't compose ZodEffects (refines). Both DbEnv and AiEnv are
// refined, so we intersect them with the rest. `intersection()` preserves
// each branch's inferred shape and validations.
//
// Production-only refinement: secrets become REQUIRED when NODE_ENV is
// 'production'. We can't refine AuthEnv in isolation because NODE_ENV lives
// in RuntimeEnv — by checking after the intersection we see the combined shape.
export const ServerEnvSchema = z
  .intersection(
    z.intersection(DbEnv, AiEnv),
    AuthEnv.extend(CacheEnv.shape)
      .extend(ProvidersEnv.shape)
      .extend(NotifyEnv.shape)
      .extend(PublicEnv.shape)
      .extend(RuntimeEnv.shape),
  )
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      Boolean(env.AUTH_SECRET && env.CRON_SECRET && env.ENCRYPTION_SECRET),
    {
      message:
        'In production, AUTH_SECRET, CRON_SECRET, and ENCRYPTION_SECRET are all required. ' +
        'Generate them with ./docker/init-secrets.sh or pnpm setup.',
      path: ['AUTH_SECRET'],
    },
  )
  .refine((env) => !env.MULTI_USER_ENABLED || env.KESTREL_ENABLE_RLS, {
    path: ['KESTREL_ENABLE_RLS'],
    error:
      'MULTI_USER_ENABLED requires KESTREL_ENABLE_RLS=true. Multi-user PostgreSQL deployments must fail closed instead of running without database tenant isolation.',
  })
  .refine(
    (env) => env.REGISTRATION_MODE !== 'open' || (env.MULTI_USER_ENABLED && env.KESTREL_ENABLE_RLS),
    {
      path: ['REGISTRATION_MODE'],
      error:
        'REGISTRATION_MODE=open requires MULTI_USER_ENABLED=1 and KESTREL_ENABLE_RLS=1; open registration is unsafe without tenant isolation.',
    },
  );
// NOTE: `REGISTRATION_MODE=owner-first` is rejected by the enum in RuntimeEnv
// above. A separate `.refine()` would be unreachable — Zod skips outer
// refinements once the inner parse fails — so the removed mode is surfaced as
// the standard `invalid_enum_value` error on the REGISTRATION_MODE path.

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Read-only upgrade aliases map.
 * Deprecated aliases dropped in 0.3.0.
 */
export const DEPRECATED_ENV_ALIASES: Record<string, string> = {};

export function getDeprecatedEnvAliases(
  input: NodeJS.ProcessEnv = process.env,
): Array<{ oldName: string; newName: string }> {
  return Object.entries(DEPRECATED_ENV_ALIASES)
    .filter(([oldName, newName]) => input[oldName] !== undefined && input[newName] === undefined)
    .map(([oldName, newName]) => ({ oldName, newName }));
}

/**
 * Parse process.env into a typed env object. Throws a readable error listing
 * every missing/invalid variable. Cache the result at module-scope in callers.
 */
export function parseServerEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  const normalized = { ...input };
  const result = ServerEnvSchema.safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export {
  isTransactionPoolerUrl,
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
  resolveMigrationDatabaseUrl,
} from './env/database-url';
export { pickAiEnv, type AiEnvKeys } from './env/ai-env';
