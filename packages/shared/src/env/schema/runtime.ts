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

// Runtime env group — node environment, limits, retention windows, and the
// audit upgrade-plan feature flags validated at boot.

import { z } from 'zod';

export const RuntimeEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Daily AI cost ceiling in USD. When crossed, /api/chat returns 503. */
  MAX_DAILY_USD: z.coerce.number().positive().prefault(5),
  /** Hard cap on tool-loop iterations per chat turn. */
  MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().prefault(6),
  /** Q5 — enable semantic routing via cheap LLM classifier before keyword scoring. */
  AI_SEMANTIC_ROUTING_ENABLED: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  LOG_PROMPTS: z
    .union([z.literal('0'), z.literal('1')])
    .default('0')
    .transform((v) => v === '1'),
  /** Langfuse LLM observability. Optional — omitted = tracing disabled. */
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.url().optional(),
  /** Optional release/environment labels used by Langfuse dashboards. */
  LANGFUSE_RELEASE: z.string().min(1).optional(),
  LANGFUSE_TRACING_ENVIRONMENT: z.string().min(1).optional(),
  /**
   * Fundamental-agent web search. Disabled by default until a provider key
   * and an explicit feature flag are configured.
   */
  WEB_SEARCH_ENABLED: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  WEB_SEARCH_PROVIDER: z.enum(['exa', 'tavily', 'brave']).default('exa'),
  WEB_SEARCH_FALLBACK_PROVIDERS: z.string().default('tavily,brave'),
  WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(10).prefault(6),
  WEB_SEARCH_MAX_CALLS_PER_TURN: z.coerce.number().int().min(1).max(4).prefault(2),
  WEB_SEARCH_CACHE_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).prefault(600),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(2000).max(20000).prefault(8000),
  /**
   * Audit R15 — indirect-injection screening posture for web results.
   * `strict` (default) withholds results when the screening detector is
   * unconfigured or unreachable; `availability` keeps serving after the
   * deterministic screen only and reports the degradation.
   */
  WEB_SEARCH_SCREEN_MODE: z.enum(['strict', 'availability']).default('strict'),

  /** Deterministic no-network market-data mode for local development. */
  KESTREL_OFFLINE_MODE: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  /** Explicit opt-in for exporting prompts and model outputs to Langfuse. */
  LANGFUSE_RECORD_IO: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  /** Window used by the bearer-authenticated health alert endpoint. */
  ALERT_WINDOW_HOURS: z.coerce.number().int().min(1).max(24).prefault(1),

  // Retention values are consumed by the shared web/worker cleanup path.
  TELEMETRY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).prefault(90),
  TRACE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).prefault(30),
  RATE_LIMIT_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).prefault(2),
  PROVIDER_DAILY_QUOTA_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).prefault(3),
  CRON_RUN_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).prefault(30),
  CANDLES_1M_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).prefault(14),
  BUDGET_RESERVATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).prefault(90),

  // Feature Flags
  /**
   * Public account creation policy.
   *
   * - `first_user` (default) — registration is open only while the `user` table
   *   is empty. The first account becomes `role='admin'`, then public sign-up
   *   closes until the operator sets `open` or invites users.
   * - `open` — anyone who can reach the instance can register as a regular user.
   * - `disabled` — no public registration; administrators create or invite users.
   *
   * `owner-first` was removed — a stale `.env` pin fails validation with a Zod
   * enum error naming this variable (see the `REGISTRATION_MODE` refusals below).
   */
  REGISTRATION_MODE: z.enum(['first_user', 'open', 'disabled']).default('first_user'),
  /**
   * Phase 1 (Task 1.2) — non-admin accounts do not inherit the primary
   * administrator's stored BYOK keys, and therefore cannot spend operator-paid
   * provider quota, unless this is explicitly enabled. The administrator's
   * non-secret routing preferences still inherit.
   */
  ALLOW_SHARED_OPERATOR_KEYS: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  /**
   * Row-level security is required for every deployment. Multi-user is the only
   * supported mode, so this defaults to on; the flag is retained so tests can
   * stub it and so a misconfigured instance fails closed at boot.
   */
  KESTREL_ENABLE_RLS: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('1')
    .transform((v) => v === '1' || v === 'true'),
  /** Multi-user is the only supported deployment mode; defaults on. */
  MULTI_USER_ENABLED: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('1')
    .transform((v) => v === '1' || v === 'true'),

  // --- Audit upgrade-plan feature flags (docs/plans/kestrel-ai-agentic-audit-v2.md).
  // Parsed through `readFeatureFlag` in feature-flags.ts; these declarations
  // validate and document the variables. Flags whose behavior is unconditional
  // (router, streaming progress, mastra-v2 migration) have no toggle.
  /** Phase 2.1 — 30s fresh-only symbol-research packet cache (LRU + optional Redis). */
  PHASE2_PACKET_CACHE: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('1')
    .transform((v) => v === '1' || v === 'true'),
  /** Phase 3.1 — per-specialist top-tier model resolution for the committee. */
  PHASE3_MODEL_DIVERSITY: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  /** Phase 3.3 — structured fusion output for Full mode. */
  PHASE3_STRUCTURED_FUSION: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  /**
   * Daily spend ceiling. Audit 2026-10-31 (R3) — enforcement is now ON by
   * default: a turn that would cross `MAX_DAILY_USD` (or a user's
   * `max_daily_usd` override) is rejected with 429 instead of being ledgered
   * and allowed. Set `ENFORCE_BUDGET=0` to return to ledger-only observation
   * (previously the default), which is only safe when every account that can
   * reach the instance is trusted.
   */
  ENFORCE_BUDGET: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('1')
    .transform((v) => v === '1' || v === 'true'),
  /**
   * M-02 (audit 2026-10-18, Phase 0/2) — generic macro packet for
   * non-XAUUSD symbols (news + calendar + COT). ON by default since M-02
   * landed; `0` is the instant rollback to the prior candle-only packet.
   */
  ENABLE_GENERIC_MACRO: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('1')
    .transform((v) => v === '1' || v === 'true'),
  /**
   * P1-04 (audit 2026-10-18, Phase 3) — run a second (risk) desk per symbol
   * in comparison runs. ON by default; `0` keeps the cheaper single-desk
   * comparison where cost matters.
   */
  ENABLE_COMPARISON_RISK_DESK: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('1')
    .transform((v) => v === '1' || v === 'true'),
  /**
   * Audit plan v2 §5.3 (Q4) — non-blocking admin alert threshold: when a
   * user's daily (UTC) reserved+reconciled ledger spend reaches this many
   * dollars, the admin System Health dashboard surfaces an anomaly.
   * Informational only — the daily ledger is never capped per Q4.
   */
  ADMIN_SPEND_ALERT_USD: z.coerce.number().positive().prefault(25),
  /** Optional Redis URL for the shared packet cache (Phase 2.1). */
  REDIS_URL: z.url().optional(),
});
