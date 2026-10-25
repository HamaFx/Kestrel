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

// Auth query helpers — the encrypted BYOK payload stored in user settings.

import { and, eq } from 'drizzle-orm';

import { getDb, schema } from '../../client';
import { requireTenantIdForUser } from '../../tenant';

/**
 * Update user's API keys (encrypted BYOK payload) and updatedAt map.
 */
export async function updateUserApiKeys(
  userId: string,
  encryptedKeys: string | null,
  keysUpdatedAt: Record<string, string> | null,
): Promise<void> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  await db
    .update(schema.userSettings)
    .set({
      aiApiKeys: encryptedKeys,
      ...(keysUpdatedAt !== null ? { aiApiKeysUpdatedAt: keysUpdatedAt } : {}),
    })
    .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.tenantId, tenantId)));
}
