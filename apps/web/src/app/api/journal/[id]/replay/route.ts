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

// /api/journal/[id]/replay — fetch historical candles, technical indicators, MFE/MAE for setup replay.
// GET ?timeframe=15m

import { errorResponse, withAuth } from '@/lib/api';
import { isTimeframe, type Timeframe } from '@/lib/services/api-boundary';
import { getTradeSetupReplayService } from '@/lib/services/journal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (req, { user, params }) => {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const tfParam = url.searchParams.get('timeframe') ?? '15m';
    const tf: Timeframe = isTimeframe(tfParam) ? tfParam : '15m';

    const replay = await getTradeSetupReplayService({
      userId: user.userId,
      id,
      timeframe: tf,
    });

    if (!replay) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Journal entry not found' } },
        { status: 404 },
      );
    }

    return Response.json({ replay });
  } catch (err) {
    return errorResponse(err);
  }
});
