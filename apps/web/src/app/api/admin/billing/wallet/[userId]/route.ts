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

// GET /api/admin/billing/wallet/:userId — wallet + entitlement lookup.

import { withAdminAuth } from '@/lib/admin-auth';
import { errorResponse } from '@/lib/api';
import {
  getEntitlementSnapshot,
  listLedger,
  requireTenantIdForUser,
  withTenantDbFresh,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminAuth<{ userId: string }>(async (_req, { params }) => {
  try {
    const { userId } = await params;
    const tenantId = await requireTenantIdForUser(userId);
    // Admin reads still need the tenant GUC: the app connection is FORCE RLS.
    const [snapshot, ledger] = await withTenantDbFresh(tenantId, () =>
      Promise.all([
        getEntitlementSnapshot(userId),
        listLedger(userId, { limit: 25 }),
      ]),
    );
    return Response.json({
      userId,
      planName: snapshot.planName,
      status: snapshot.status,
      monthlyCredits: snapshot.monthlyCredits,
      features: snapshot.features,
      wallet: snapshot.wallet,
      ledger: ledger.rows,
      nextCursor: ledger.nextCursor,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
