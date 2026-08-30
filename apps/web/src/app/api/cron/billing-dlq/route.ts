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

// GET /api/cron/billing-dlq — alert on authenticated billing webhook
// failures that have remained pending or replaying for at least one hour.

import * as Sentry from '@sentry/nextjs';

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { countStaleBillingWebhookFailures } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(
    req,
    async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000);
      const pendingOlderThanHour = await countStaleBillingWebhookFailures(cutoff);

      if (pendingOlderThanHour > 0) {
        Sentry.captureMessage('Billing webhook DLQ has stale entries', {
          level: 'error',
          tags: { component: 'billing-webhook', kind: 'dlq-stale' },
          extra: { pendingOlderThanHour, cutoff: cutoff.toISOString() },
        });
        createScopedLoggerWithContext({ component: 'cron', job: 'billing-dlq' }).error(
          { pendingOlderThanHour, cutoff: cutoff.toISOString() },
          'billing webhook DLQ contains stale pending or replaying entries',
        );
      }

      return {
        processed: pendingOlderThanHour,
        note:
          pendingOlderThanHour > 0
            ? `${pendingOlderThanHour} pending or replaying billing webhook failure(s) older than one hour`
            : 'No stale billing webhook failures',
      };
    },
    { requireAdminSession: true },
  );
}
