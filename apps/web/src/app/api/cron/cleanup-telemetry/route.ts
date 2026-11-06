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

// DB-1: GET /api/cron/cleanup-telemetry — purges stale operational rows.
//
// Targets: rate_limits, chat_telemetry, tool_telemetry, diagnostic_traces,
// provider_daily_quota, expired verification tokens, expired share snapshots,
// recovery ledgers, stale AI budget reservations, and Mastra storage. The
// runner lives in `@/lib/services/cron-jobs` and mirrors the worker
// `retention` job exactly (VACUUM excepted: it is worker-only).
//
// Schedule: daily via Vercel cron or an external scheduler.
//
// most targets are RLS-protected tenant tables and
// retention is system-wide (all tenants), so the admin (BYPASSRLS)
// connection is required — the worker runs the same cleanup on admin.

import { withCronAuth } from '@/lib/http/cron';
import { runCleanupTelemetryCronService } from '@/lib/services/cron-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => runCleanupTelemetryCronService());
}
