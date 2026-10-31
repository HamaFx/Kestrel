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

import { schema } from '../../client';
import { requireTenantIdForUser } from '../../tenant';
import { withUserTenant } from '../../with-user-tenant';

/**
 * Create an audit log entry (best-effort, fail open).
 *
 * Audit 2026-10-31 (R1): `audit_logs` carries `tenant_isolation` RLS, so the
 * INSERT must run in the user's tenant scope. `withUserTenant` reuses an
 * active same-user scope (route handlers, scoped server actions) and opens one
 * for callers outside the request boundary (password reset, login actions).
 * Without it the write was rejected and — because this helper fails open —
 * silently dropped.
 */
export async function createAuditLog(
  userId: string,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await withUserTenant(userId, async (db) => {
      const tenantId = await requireTenantIdForUser(userId, db);
      await db.insert(schema.auditLogs).values({ userId, tenantId, action, metadata });
    });
  } catch (err) {
    // Fail open — audit logging is best-effort and must not break the caller
    // (password reset, 2FA changes). But a failure is now observable: before
    // the R1 scope fix every write was rejected and swallowed here, silently
    // losing the entry on a normal path.
    console.warn('[db] audit log write failed — entry dropped', {
      userId,
      action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
