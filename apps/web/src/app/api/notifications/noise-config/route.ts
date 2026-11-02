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

import { NoiseConfigSchema } from '@kestrel/shared';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import { getNoiseConfigService, updateNoiseConfigService } from '@/lib/services/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    return Response.json(await getNoiseConfigService(user.userId));
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  try {
    const partial = await parseJsonBody(req, NoiseConfigSchema.partial());
    return Response.json(await updateNoiseConfigService(user.userId, partial));
  } catch (err) {
    return errorResponse(err);
  }
});
