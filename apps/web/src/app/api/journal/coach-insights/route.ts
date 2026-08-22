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

// /api/journal/coach-insights — generate aggregate AI coaching diagnostics and leak detection.
// POST /api/journal/coach-insights

import { errorResponse, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { getUserWithSettings } from '@/lib/services/api-boundary';
import { getCoachInsightsService } from '@/lib/services/journal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const { settings: userSettings } = await getUserWithSettings(user.userId);

    if (!userSettings) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'User settings not found' } },
        { status: 404 },
      );
    }

    const env = getServerEnv();
    const insights = await getCoachInsightsService({
      userId: user.userId,
      userSettings,
      env,
      signal: req.signal,
    });

    return Response.json({ insights });
  } catch (err) {
    return errorResponse(err);
  }
});
