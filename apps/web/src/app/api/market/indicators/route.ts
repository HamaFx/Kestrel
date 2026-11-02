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

// PF-22 — /api/market/indicators — compute indicators (thin controller).

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import { checkMarketRateLimit, getIndicatorsService } from '@/lib/services/market';
import { rateLimitedResponse } from '@/lib/services/rate-limit';

const BodySchema = z.object({
  symbol: z.string(),
  tf: z.string().default('1h'),
  count: z.int().min(1).max(5000).default(300),
  indicators: z
    .array(z.object({ kind: z.string(), params: z.record(z.string(), z.unknown()).default({}) }))
    .min(1)
    .max(10),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const rl = await checkMarketRateLimit(user.userId);
    if (!rl.allowed) {
      return rateLimitedResponse(rl);
    }
    const { symbol, tf, count, indicators } = await parseJsonBody(req, BodySchema);
    const result = await getIndicatorsService(
      user.userId,
      symbol,
      tf as '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w',
      count,
      indicators,
    );
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
