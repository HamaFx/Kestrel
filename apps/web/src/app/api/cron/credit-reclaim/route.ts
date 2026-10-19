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

// GET /api/cron/credit-reclaim — release reservations orphaned by a crash.
// Mirrors the budget ledger recovery sweep; a live Full-analysis lease keeps
// its reservation until the worker settles it.

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { reclaimStaleCreditReservations } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(
    req,
    async () => {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000);
      const result = await reclaimStaleCreditReservations(cutoff, 200);
      if (result.released > 0 || result.failed > 0) {
        createScopedLoggerWithContext({ component: 'cron', job: 'credit-reclaim' }).info(
          result,
          'credit reservation reclamation completed',
        );
      }
      return {
        processed: result.scanned,
        released: result.released,
        failed: result.failed,
        note: `scanned=${result.scanned}, released=${result.released}, failed=${result.failed}`,
      };
    },
    { requireAdminSession: true },
  );
}
