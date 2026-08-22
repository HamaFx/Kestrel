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

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';
import type { TraceExplorerResponse } from '@/lib/services/admin-dtos';
import { listTraceExplorerEvents } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  traceId: z.string().trim().min(1).max(200).optional(),
  runId: z.string().trim().min(1).max(200).optional(),
  jobId: z.string().trim().min(1).max(200).optional(),
  threadId: z.string().trim().min(1).max(200).optional(),
  messageId: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const GET = withAdminAuth(async (req) => {
  const filters = parseSearchParams(req, querySchema);
  const events = await listTraceExplorerEvents(filters);

  const bySource: Record<string, number> = {};
  let failures = 0;
  for (const event of events) {
    bySource[event.source] = (bySource[event.source] ?? 0) + 1;
    if (event.status === 'failed' || event.status === 'dead' || event.status === 'error')
      failures += 1;
  }

  const response: TraceExplorerResponse = {
    events: events.map((event) => ({
      ...event,
      timestamp: event.timestamp.toISOString(),
    })),
    stats: { total: events.length, bySource, failures },
  };

  return Response.json(response);
});
