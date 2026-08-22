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

// /api/notifications/noise-config — get or update noise control config.
// GET  /api/notifications/noise-config
// PUT  /api/notifications/noise-config

import { errorResponse, withAuth } from '@/lib/api';
import {
  getNoiseConfig,
  NoiseConfigSchema,
  saveNoiseConfig,
  type NoiseConfig,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const config = await getNoiseConfig(user.userId);
    return Response.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    // Validate partial config — allow partial updates
    const partial = NoiseConfigSchema.partial().parse(body);

    // Clean undefined values to prevent overwriting existing settings with undefined during spread merges
    const cleaned = Object.fromEntries(
      Object.entries(partial).filter(([_, v]) => v !== undefined),
    ) as Partial<NoiseConfig>;

    const config = await saveNoiseConfig(user.userId, cleaned);
    return Response.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
});
