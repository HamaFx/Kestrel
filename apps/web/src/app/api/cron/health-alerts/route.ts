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

/**
 * GET /api/cron/health-alerts
 *
 * Computes the reliability snapshot and sends a sanitized webhook notification
 * when the system is degraded or unhealthy. The endpoint is intended for the
 * existing VM/Vercel cron scheduler and is protected by CRON_SECRET.
 */

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { computeHealthSloService } from '@/lib/services/admin-health';
import { getDb } from '@/lib/services/api-boundary';
import { deliverHealthAlert } from '@/lib/services/health-alert-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return withCronAuth(
    request,
    async () => {
      const snapshot = await computeHealthSloService(getDb(), {
        hours: Number.parseInt(process.env.ALERT_WINDOW_HOURS ?? '1', 10) || 1,
      });
      const delivery = await deliverHealthAlert(snapshot);

      if (delivery.status === 'failed') {
        createScopedLoggerWithContext({ component: 'cron', job: 'health-alerts' }).error(
          { deliveryStatus: delivery.status, reason: delivery.reason },
          'health alert delivery failed after SLO evaluation',
        );
      }

      return {
        processed: snapshot.anomalies.length,
        note: `${snapshot.overall}; webhook=${delivery.status}${
          delivery.status === 'skipped' ? `:${delivery.reason}` : ''
        }`,
      };
    },
    { requireAdminSession: true },
  );
}
