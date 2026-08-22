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

// U2 — GET /api/chat/analysis-jobs/[jobId]
//
// Polling endpoint for background multi-agent analysis jobs.

import { withAuth } from '@/lib/api';
import { getFullAnalysisRun } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidJobId(id: string): boolean {
  return /^[a-f0-9-]{10,80}$/i.test(id);
}

export const GET = withAuth<{ jobId: string }>(async (req, ctx) => {
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json(
      { error: { code: 'VALIDATION', message: 'Invalid jobId' } },
      { status: 400 },
    );
  }

  const job = await getFullAnalysisRun(ctx.user.userId, jobId);

  if (!job) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Job not found' } },
      { status: 404 },
    );
  }

  return Response.json({
    id: job.id,
    status: job.status,
    progress: job.progress ?? [],
    result: job.result ?? null,
    // Keep provider/database details in server logs only. The polling
    // endpoint is user-facing and should expose a stable public message.
    error:
      job.status === 'failed'
        ? 'Full analysis could not be completed. No partial answer was returned.'
        : null,
    createdAt:
      typeof job.createdAt === 'string'
        ? job.createdAt
        : job.createdAt
          ? new Date(job.createdAt).toISOString()
          : undefined,
    completedAt:
      typeof job.completedAt === 'string'
        ? job.completedAt
        : job.completedAt
          ? new Date(job.completedAt).toISOString()
          : null,
  });
});
