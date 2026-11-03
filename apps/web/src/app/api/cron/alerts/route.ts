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

// SPDX-License-Identifier: Apache-2.0

// GET /api/cron/alerts — evaluates active, unfired alerts against the
// latest cached prices/indicators, fires email notifications via Resend,
// marks fired_at + sets active=false. Idempotent under repeat firing
// because we only consider rows with firedAt IS NULL.
//
// Cadence: 1 min on Pro (`vercel.json` crons), 5 min on Hobby external
// scheduler. The eval is fast (one cached price call per priceCross + one
// candle call per (symbol, tf) deduped via the data cache).
//
// R16 (audit 2026-10-31) — ownership and partitioning:
//   * The worker's own `alerts` job (`JOBS.alerts`, every minute) is the
//     owner under the Docker Compose profile; the external schedulers that
//     used to also poke this route every 5 minutes were removed so a profile
//     has exactly one alerts scheduler. Keep it that way: if this route is
//     poked by a deployment profile, that profile must disable the worker job
//     (or its poker) instead of running both.
//   * The evaluator now filters through the same tenant partition the worker
//     uses, so a partitioned deployment cannot have this route process
//     another partition's users.
//
// Audit 2026-10-31 (R1): `alerts` and the `user_settings` join are
// RLS-protected and the evaluator is cross-tenant by design (one pass over
// every user's alerts, then per-user writes with explicit tenant
// predicates). `withCronAuth` opens no scope, so run it on the admin
// (BYPASSRLS) connection — the same path the worker uses.

import { withCronAuth } from '@/lib/http/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { evaluateAlertsAcrossTenants } from '@/lib/services/alerts';
import { ownsTenantInPartition, resolveWorkerPartition } from '@/lib/services/worker-partition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    // Resolve once per request: an invalid WORKER_PARTITION pair fails before
    // any alert is evaluated rather than mid-pass.
    const partition = resolveWorkerPartition();
    const result = await evaluateAlertsAcrossTenants({
      ...(req.signal ? { signal: req.signal } : {}),
      ownsTenant: (userId) => ownsTenantInPartition(userId, partition),
    });

    // OBS-04 (Phase 5.3): Capture per-alert errors to Sentry + pino logger
    if (result.errors.length > 0) {
      const log = createScopedLoggerWithContext({ component: 'cron', job: 'alerts' });
      for (const alertErr of result.errors) {
        log.error({ err: String(alertErr) }, 'alert evaluation error');
      }
    }

    const errs = result.errors.length ? `, errors=${result.errors.length}` : '';
    return {
      processed: result.total,
      note: `matched=${result.matched} fired=${result.fired} skipped=${result.skipped}${errs}`,
    };
  });
}
