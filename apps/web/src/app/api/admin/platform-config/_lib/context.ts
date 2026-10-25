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

// Resolve the desk the platform config applies to: the platform admin user,
// falling back to the caller when no platform admin row exists.

import { getDb } from '@kestrel/ai';
import { getPlatformAdminUserId, requireTenantIdForUser } from '@kestrel/db';

export interface PlatformConfigContext {
  db: ReturnType<typeof getDb>;
  targetUserId: string;
  tenantId: string;
}

export async function resolvePlatformConfigTarget(
  callerUserId: string,
): Promise<PlatformConfigContext> {
  const db = getDb();
  const platformAdminId = (await getPlatformAdminUserId()) ?? callerUserId;
  const targetUserId = platformAdminId;
  const tenantId = await requireTenantIdForUser(targetUserId, db);
  return { db, targetUserId, tenantId };
}
