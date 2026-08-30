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

import { withAdminAuth } from '@/lib/admin-auth';
import { jsonApiError } from '@/lib/api-errors';
import { recordAdminAudit } from '@/lib/services/admin';
import type {
  DiagnosticTraceDetail,
  DiagnosticTraceError,
  DiagnosticTraceStep,
} from '@/lib/services/admin-dtos';
import { getDiagnosticTraceForAdmin, type DiagnosticTraceRow } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminAuth<{ id: string }>(async (req, { user, params }) => {
  const { id } = await params;

  const row = await getDiagnosticTraceForAdmin(id);

  if (!row) {
    return jsonApiError('NOT_FOUND', 'Trace not found', 404, req);
  }

  const traceRow = row as DiagnosticTraceRow;
  const traceData = (traceRow.trace ?? {}) as { steps?: unknown; errors?: unknown };

  await recordAdminAudit(user.userId, 'diagnostic.trace.view', traceRow.userId ?? undefined, {
    traceId: id,
  });

  const trace: DiagnosticTraceDetail = {
    id: traceRow.id,
    threadId: traceRow.threadId ?? '',
    userId: traceRow.userId ?? '',
    startedAt: traceRow.startedAt.toISOString(),
    stepCount: traceRow.stepCount,
    errorCount: traceRow.errorCount,
    status: traceRow.status as 'completed' | 'failed',
    durationMs: traceRow.durationMs ?? null,
    summary: traceRow.summary,
    metadata: (traceRow.metadata ?? null) as DiagnosticTraceDetail['metadata'],
    steps: Array.isArray(traceData.steps) ? (traceData.steps as DiagnosticTraceStep[]) : [],
    errors: Array.isArray(traceData.errors) ? (traceData.errors as DiagnosticTraceError[]) : [],
  };

  return Response.json({ trace });
});
