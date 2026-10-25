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

// Auth query helpers — TOTP secret storage and 2FA toggling.

import { eq } from 'drizzle-orm';

import { getDb, schema } from '../../client';

/**
 * Update the two-factor secret for a user (stores encrypted secret).
 */
export async function updateTwoFactorSecret(
  userId: string,
  encryptedSecret: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ twoFactorSecret: encryptedSecret })
    .where(eq(schema.users.id, userId));
}

/**
 * Get a user's two-factor secret.
 */
export async function getTwoFactorSecret(userId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db
    .select({ twoFactorSecret: schema.users.twoFactorSecret })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.twoFactorSecret ?? null;
}

/**
 * Enable or disable 2FA for a user.
 */
export async function setTwoFactorEnabled(userId: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ twoFactorEnabled: enabled })
    .where(eq(schema.users.id, userId));
}
