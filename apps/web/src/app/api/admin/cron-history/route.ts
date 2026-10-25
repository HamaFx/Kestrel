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
import { listCronRuns } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).prefault(7),
  jobName: z.string().optional(),
});

export const GET = withAdminAuth(async (req) => {
  const { days, jobName } = parseSearchParams(req, querySchema);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rawRuns = await listCronRuns({ since, jobName });
  const runs = rawRuns.map((r) => ({
    id: `${r.jobName}:${r.runDate}`,
    jobName: r.jobName,
    status: r.status,
    note: r.note,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
  }));
  return Response.json({ runs });
});
