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

// GET /api/admin/impersonate/probe
//
// Returns whether impersonation is currently enabled. The client uses
// this to decide whether to render the impersonate UI.

import { withAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async () => {
  const enabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.ENABLE_IMPERSONATION === 'true' &&
    process.env.ALLOW_INSECURE_DEV_AUTH === 'true';

  return Response.json({ enabled });
});
