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

// GET /api/billing/ledger?cursor=&limit=&kind= — paginated credit ledger.

import { errorResponse, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { listLedger } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    if (!getServerEnv().BILLING_ENABLED) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Billing is disabled in this deployment' } },
        { status: 404 },
      );
    }
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor');
    const kind = url.searchParams.get('kind');
    const limitRaw = Number(url.searchParams.get('limit') ?? 25);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 25;
    const page = await listLedger(user.userId, {
      cursor,
      limit,
      kind,
    });
    return Response.json({
      rows: page.rows,
      nextCursor: page.nextCursor,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
