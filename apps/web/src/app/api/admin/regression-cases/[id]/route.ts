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
import { errorResponse, parseJsonBody } from '@/lib/api';
import { recordAdminAudit } from '@/lib/services/admin';
import { updateAiRegressionCaseStatus } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['open', 'resolved', 'dismissed']),
});

export const PATCH = withAdminAuth<{ id: string }>(async (req, { user, params }) => {
  const { id } = await params;
  try {
    const body = await parseJsonBody(req, bodySchema);
    const row = await updateAiRegressionCaseStatus(id, body.status);
    if (!row) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Regression case not found' } },
        { status: 404 },
      );
    }
    await recordAdminAudit(user.userId, 'ai.regression-case.update', undefined, {
      regressionCaseId: row.id,
      status: row.status,
    });
    return Response.json({ case: row });
  } catch (error) {
    return errorResponse(error, req);
  }
});
