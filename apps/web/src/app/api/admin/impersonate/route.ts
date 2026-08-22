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

import { generateImpersonationChallenge, signIn } from '@/auth';
import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';
import { recordAdminAudit } from '@/lib/services/admin';
import { getUserById } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const impersonateSchema = z.object({
  userId: z.string(),
});

export const POST = withAdminAuth(async (req, { user: admin }) => {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_IMPERSONATION !== 'true') {
    return Response.json(
      { error: { code: 'FORBIDDEN', message: 'Impersonation is disabled' } },
      { status: 403 },
    );
  }

  const { userId } = await parseJsonBody(req, impersonateSchema);

  const targetUser = await getUserById(userId);

  if (!targetUser) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'User not found' } },
      { status: 404 },
    );
  }

  try {
    // H-1: Generate a signed challenge token that the impersonation
    // provider verifies. This prevents direct calls to the impersonation
    // provider from bypassing the admin check in this route.
    const challenge = generateImpersonationChallenge();
    await signIn('impersonate', { userId, challenge, redirect: false });

    await recordAdminAudit(admin.userId, 'impersonate.start', userId);

    return Response.json({ ok: true, redirect: '/chat' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: { code: 'INTERNAL', message } }, { status: 500 });
  }
});
