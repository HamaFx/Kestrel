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

// Cheap tenant-scoped corpus probe.

import { requireTenantIdForUser, schema } from '@kestrel/db';
import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '../../runtime/db';
import type { MemoryKind } from './types';

/** Cheap tenant-scoped probe — has this user's requested corpus had any data? */
export async function countMemory(userId: string, kinds?: MemoryKind[]): Promise<number> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const filters = [
    eq(schema.memoryEmbeddings.userId, userId),
    eq(schema.memoryEmbeddings.tenantId, tenantId),
  ];
  if (kinds && kinds.length > 0) filters.push(inArray(schema.memoryEmbeddings.kind, kinds));
  const rows = await getDb()
    .select({ id: schema.memoryEmbeddings.id })
    .from(schema.memoryEmbeddings)
    .where(and(...filters))
    .limit(1);
  return rows.length;
}
