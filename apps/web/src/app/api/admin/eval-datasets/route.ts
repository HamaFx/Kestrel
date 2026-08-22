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
import { errorResponse, parseJsonBody, parseSearchParams } from '@/lib/api';
import { listEvalDatasets, registerEvalDataset } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['draft', 'in_review', 'approved', 'archived']).optional(),
});

const bodySchema = z.object({
  version: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._-]+$/),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  recordCount: z.number().int().min(0).max(10_000_000),
  source: z.string().trim().min(1).max(200),
  provenance: z.record(z.unknown()).default({}),
});

export const GET = withAdminAuth(async (req) => {
  const query = parseSearchParams(req, querySchema);
  const rows = await listEvalDatasets(query.limit, query.offset, query.status);
  return Response.json({ datasets: rows });
});

export const POST = withAdminAuth(async (req, { user }) => {
  try {
    const body = await parseJsonBody(req, bodySchema);
    const row = await registerEvalDataset({ ...body, createdBy: user.userId });
    if (!row) {
      return Response.json(
        { error: { code: 'CONFLICT', message: 'Dataset version already exists' } },
        { status: 409 },
      );
    }
    await import('@/lib/services/admin').then(({ recordAdminAudit }) =>
      recordAdminAudit(user.userId, 'ai.dataset.register', undefined, {
        version: row.version,
        contentSha256: row.contentSha256,
        recordCount: row.recordCount,
      }),
    );
    return Response.json({ dataset: row }, { status: 201 });
  } catch (error) {
    return errorResponse(error, req);
  }
});
