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

// PR-06: SLI/SLO health metrics endpoint for the System Health dashboard.
//
// Thin controller — all computation lives in
// `src/lib/services/admin-health.ts`.

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';
import { computeHealthSloService } from '@/lib/services/admin-health';
import { getDb } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  /** Window in hours for SLI computation. Default 24. Max 720 (30 days). */
  hours: z.coerce.number().int().min(1).max(720).default(24),
});

export const GET = withAdminAuth(async (req) => {
  const { hours } = parseSearchParams(req, querySchema);

  const db = getDb();
  const response = await computeHealthSloService(db, { hours });

  return Response.json(response);
});
