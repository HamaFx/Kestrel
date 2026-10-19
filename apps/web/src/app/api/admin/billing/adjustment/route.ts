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

// POST /api/admin/billing/adjustment — manual credit grant/deduction.
// Every adjustment writes an `admin_audit` row (plan §14).

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { errorResponse, parseJsonBody } from '@/lib/api';
import { recordAdminAudit } from '@/lib/services/admin';
import {
  grantCredits,
  requireTenantIdForUser,
  withTenantDbFresh,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AdjustmentSchema = z.object({
  userId: z.string().min(1),
  amountCredits: z.number().int().refine((value) => value !== 0, 'Amount must be non-zero'),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export const POST = withAdminAuth(async (req, { user }) => {
  try {
    const body = await parseJsonBody(req, AdjustmentSchema);
    const tenantId = await requireTenantIdForUser(body.userId);
    const result = await withTenantDbFresh(tenantId, () =>
      grantCredits({
        userId: body.userId,
        tenantId,
        amountCredits: body.amountCredits,
        kind: 'admin_adjustment',
        idempotencyKey:
          body.idempotencyKey ?? `admin:${user.userId}:${randomUUID()}`,
        referenceType: 'manual',
        referenceId: user.userId,
        metadata: { reason: body.reason, actorUserId: user.userId },
      }),
    );
    await recordAdminAudit(user.userId, 'billing.credit.adjustment', body.userId, {
      amountCredits: body.amountCredits,
      reason: body.reason,
      ledgerId: result.ledgerId,
      balanceAfter: result.balanceAfter,
    });
    return Response.json({
      ledgerId: result.ledgerId,
      balanceAfter: result.balanceAfter,
      applied: result.applied,
    });
  } catch (err) {
    return errorResponse(err, req);
  }
});
