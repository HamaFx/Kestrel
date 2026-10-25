/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Auth query helpers — best-effort audit logging.

import { getDb, schema } from '../../client';
import { requireTenantIdForUser } from '../../tenant';

/** Create an audit log entry (best-effort, fail open). */
export async function createAuditLog(
  userId: string,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = getDb();
    const tenantId = await requireTenantIdForUser(userId, db);
    await db.insert(schema.auditLogs).values({ userId, tenantId, action, metadata });
  } catch {
    // fail open — audit logging is best-effort
  }
}
