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

// Auth query helpers — email verification / password reset token rows.

import { and, eq, gt } from 'drizzle-orm';

import { getDb, schema } from '../../client';

/** Create a verification token (email_verify or password_reset). */
export async function createVerificationToken(
  identifier: string,
  hashedToken: string,
  purpose: string,
  expires: Date,
): Promise<void> {
  const db = getDb();
  await db.insert(schema.verificationTokens).values({
    identifier,
    token: hashedToken,
    purpose,
    expires,
  });
}

/** Find a non-expired verification token by hash + purpose. */
export async function findVerificationToken(hashedToken: string, purpose: string) {
  const db = getDb();
  const [vt] = await db
    .select()
    .from(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.token, hashedToken),
        eq(schema.verificationTokens.purpose, purpose),
        gt(schema.verificationTokens.expires, new Date()),
      ),
    )
    .limit(1);
  return vt ?? null;
}

/** Delete a verification token by hash + purpose (single-use). */
export async function deleteVerificationToken(hashedToken: string, purpose: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.token, hashedToken),
        eq(schema.verificationTokens.purpose, purpose),
      ),
    );
}
