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
import { parseJsonBody } from '@/lib/api';
import { jsonApiError } from '@/lib/api-errors';
import { recordAdminAudit } from '@/lib/services/admin';
import { getUserById, resetOnboarding } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resetSchema = z.object({
  userId: z.string().optional(),
  mode: z.enum(['full', 'soft']).default('soft'),
});

export const POST = withAdminAuth(async (req, { user: admin }) => {
  const body = await parseJsonBody(req, resetSchema);
  // The admin inspector can submit an empty-string userId to mean "my own
  // account". Treat blank/whitespace values as unset so they fall back to
  // the authenticated admin instead of failing the user lookup.
  const targetUserId = body.userId?.trim() || admin.userId;

  // Verify target user exists
  const targetUser = await getUserById(targetUserId);

  if (!targetUser) {
    return jsonApiError('NOT_FOUND', 'User not found', 404, req);
  }

  await resetOnboarding(targetUserId, body.mode);

  await recordAdminAudit(admin.userId, 'onboarding.reset', targetUserId, { mode: body.mode });

  return Response.json({ ok: true, userId: targetUserId, reset: true, mode: body.mode });
});
