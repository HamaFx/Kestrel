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

// /api/settings/usage-by-agent — per-agent and per-mode cost breakdown.
//
// Returns:
//   {
//     byAgent: [{ agentName, turns, totalCostUsd, avgLatencyMs }],
//     byMode:  [{ analysisMode, turns, totalCostUsd }],
//     totalCostUsd, totalTurns
//   }
//
// Auth: NextAuth session gate. Per-user data only.

import { errorResponse, withAuth } from '@/lib/http/api';
import { getUsageByAgent } from '@/lib/services/settings/usage-by-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const USAGE_WINDOW_DAYS = 30;

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const usage = await getUsageByAgent({
      userId: user.userId,
      periodDays: USAGE_WINDOW_DAYS,
    });
    return Response.json(usage);
  } catch (err) {
    return errorResponse(err);
  }
});
