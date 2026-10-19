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

// GET /api/billing/wallet — current balance + entitlement snapshot.

import { errorResponse, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { getEntitlementSnapshot } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    if (!getServerEnv().BILLING_ENABLED) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Billing is disabled in this deployment' } },
        { status: 404 },
      );
    }
    const snapshot = await getEntitlementSnapshot(user.userId);
    return Response.json({
      userId: snapshot.userId,
      available: snapshot.wallet.availableCredits,
      lifetimeGranted: snapshot.wallet.lifetimeGranted,
      lifetimeConsumed: snapshot.wallet.lifetimeConsumed,
      updatedAt: snapshot.wallet.updatedAt,
      plan: {
        id: snapshot.planId,
        name: snapshot.planName,
        monthlyCredits: snapshot.monthlyCredits,
        status: snapshot.status,
        currentPeriodStart: snapshot.currentPeriodStart,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      },
      features: snapshot.features,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
