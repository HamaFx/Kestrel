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

// POST /api/admin/billing/dlq/:id/replay — replay one authenticated
// NOWPayments webhook failure through the canonical webhook processor.

import {
  IpnPayloadSchema,
  processVerifiedIpnPayload,
  type IpnPayload,
} from '@/app/api/billing/webhook/route';
import { withAdminAuth } from '@/lib/admin-auth';
import { jsonApiError } from '@/lib/api-errors';
import {
  claimBillingWebhookReplay,
  markBillingWebhookReplayed,
  releaseBillingWebhookReplay,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

export const POST = withAdminAuth<Params>(async (req, { params }) => {
  const { id } = await params;
  const entry = await claimBillingWebhookReplay(id);
  if (!entry) {
    return jsonApiError('NOT_FOUND', 'DLQ entry is missing or already being replayed', 404, req);
  }

  try {
    if (!entry.replayToken) {
      throw new Error('DLQ replay lease is missing');
    }
    if (entry.provider !== 'nowpayments') {
      throw new Error('Unsupported billing webhook provider');
    }
    const parsed = IpnPayloadSchema.safeParse(entry.payload);
    if (!parsed.success) {
      throw new Error('DLQ payload failed billing webhook validation');
    }
    const payload = parsed.data as IpnPayload;
    await processVerifiedIpnPayload(payload);
    await markBillingWebhookReplayed(id, entry.replayToken);
    return Response.json({ ok: true, id, status: 'replayed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (entry.replayToken) await releaseBillingWebhookReplay(id, message, entry.replayToken);
    return jsonApiError('REPLAY_FAILED', 'DLQ replay failed', 422, req);
  }
});
