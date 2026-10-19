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

// Credit top-up catalogue queries.

import { and, asc, eq } from 'drizzle-orm';

import { getDb, schema } from '../client';

export async function listActiveTopupProducts() {
  const db = getDb();
  return db
    .select()
    .from(schema.creditTopupProducts)
    .where(eq(schema.creditTopupProducts.isActive, true))
    .orderBy(asc(schema.creditTopupProducts.sortOrder));
}

export async function getTopupProduct(id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.creditTopupProducts)
    .where(and(eq(schema.creditTopupProducts.id, id), eq(schema.creditTopupProducts.isActive, true)))
    .limit(1);
  return row ?? null;
}
