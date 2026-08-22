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
import { listFeedbackForReview } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['unreviewed', 'in_review', 'reviewed', 'rejected']).optional(),
});

export const GET = withAdminAuth(async (req) => {
  const query = parseSearchParams(req, querySchema);
  const rows = await listFeedbackForReview({
    limit: query.limit,
    offset: query.offset,
    ...(query.status ? { reviewStatus: query.status } : {}),
  });
  return Response.json({ feedback: rows.map(toDto) });
});

function toDto(row: Awaited<ReturnType<typeof listFeedbackForReview>>[number]) {
  return {
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    messageId: row.messageId,
    traceId: row.traceId,
    rating: row.rating,
    userNote: row.userNote,
    reviewStatus: row.reviewStatus,
    reviewerId: row.reviewerId,
    reviewerLabel: row.reviewerLabel,
    issueCodes: row.issueCodes,
    reviewerNote: row.reviewerNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
