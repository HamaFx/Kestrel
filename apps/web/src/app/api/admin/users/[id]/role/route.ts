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

// S-2 — Admin endpoint to promote / demote users.

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';
import { jsonApiError } from '@/lib/api-errors';
import { LastAdminError, SelfDemoteError, updateUserRoleService } from '@/lib/services/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  role: z.enum(['admin', 'user']),
});

interface Params {
  id: string;
}

export const PATCH = withAdminAuth<Params>(async (req, { user, params }) => {
  const { id } = await params;
  const { role } = await parseJsonBody(req, bodySchema);

  try {
    const result = await updateUserRoleService({
      actorUserId: user.userId,
      targetUserId: id,
      role,
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof LastAdminError) {
      return jsonApiError('LAST_ADMIN', err.message, 409, req);
    }

    if (err instanceof SelfDemoteError) {
      return jsonApiError('SELF_DEMOTE', err.message, 409, req);
    }

    if (err instanceof Error && err.message === 'User not found') {
      return jsonApiError('NOT_FOUND', err.message, 404, req);
    }

    throw err;
  }
});
