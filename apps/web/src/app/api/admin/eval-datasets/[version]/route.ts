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
import { approveEvalDataset } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['draft', 'in_review', 'approved', 'archived']),
});

export const PATCH = withAdminAuth<{ version: string }>(async (req, { user, params }) => {
  const { version } = await params;
  try {
    const body = await parseJsonBody(req, bodySchema);
    const row = await approveEvalDataset({ version, reviewerId: user.userId, status: body.status });
    if (!row) {
      return Response.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'Invalid dataset lifecycle transition or version not found',
          },
        },
        { status: 409 },
      );
    }
    await recordAdminAudit(user.userId, 'ai.dataset.status', undefined, {
      version,
      status: body.status,
    });
    return Response.json({ dataset: row });
  } catch (error) {
    return errorResponse(error, req);
  }
});
