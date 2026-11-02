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

import { z } from 'zod';

import { withAdminAuth } from '@/lib/auth/admin-auth';
import { parseSearchParams } from '@/lib/http/api';
import { listMastraRunsForAdmin } from '@/lib/services/admin-mastra-runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).prefault(72),
  limit: z.coerce.number().int().min(1).max(500).prefault(100),
  /** Optional kind filter, e.g. `mastra_mode` or `mastra_full_job` (prefix match). */
  kind: z.string().min(2).max(64).optional(),
});

/** Admin Mastra runs viewer. The query lives in the admin service. */
export const GET = withAdminAuth(async (req) => {
  const { hours, limit, kind } = parseSearchParams(req, querySchema);
  const result = await listMastraRunsForAdmin({
    hours,
    limit,
    ...(kind ? { kind } : {}),
  });
  return Response.json(result);
});
