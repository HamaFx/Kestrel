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
import type { DiagnosticTraceSummary } from '@/lib/services/admin-dtos';
import { listDiagnosticTracesForAdmin } from '@/lib/services/api-boundary';
import type { DiagnosticTraceRow } from '@kestrel/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  threadId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAdminAuth(async (req) => {
  const { threadId, limit } = parseSearchParams(req, querySchema);

  const rows = await listDiagnosticTracesForAdmin({ threadId, limit });

  const traces: DiagnosticTraceSummary[] = (rows as DiagnosticTraceRow[]).map((row) => ({
    id: row.id,
    threadId: row.threadId ?? '',
    userId: row.userId ?? '',
    startedAt: row.startedAt.toISOString(),
    stepCount: row.stepCount,
    errorCount: row.errorCount,
  }));

  return Response.json({ traces });
});
