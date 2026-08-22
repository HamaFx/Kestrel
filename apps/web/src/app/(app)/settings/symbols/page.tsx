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

import { getDb, getWatchlistWithCatalog, schema } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { SymbolsForm } from '../_components/symbols/symbols-form';

export default async function SymbolsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const db = getDb();

  // Fetch the active symbol catalog for the search/combobox options
  const catalog = await db
    .select()
    .from(schema.symbolCatalog)
    .where(
      and(eq(schema.symbolCatalog.isActive, true), eq(schema.symbolCatalog.tenantId, '__system__')),
    )
    .orderBy(schema.symbolCatalog.sortOrder);

  // Fetch the user's watchlist with catalog metadata
  const rawSymbols = await getWatchlistWithCatalog(session.user.id);
  // Map to the component's expected shape — WatchlistEntry has nullable fields
  const symbols = rawSymbols.map((s) => ({
    ...s,
    name: s.name ?? '',
    category: s.category ?? '',
    exchange: s.exchange ?? '',
    tvTicker: s.tvTicker ?? '',
    pipSize: s.pipSize ?? 0,
    priceDecimals: s.priceDecimals ?? 0,
    currencyTags: s.currencyTags ?? [],
    isActive: s.isActive ?? false,
    displayOrder: s.displayOrder ?? 0,
  }));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-fg text-lg font-semibold">Symbols Watchlist</h2>
        <p className="text-fg-subtle text-sm">
          Manage and reorder the instruments you want to track across the app.
        </p>
      </div>

      <SymbolsForm initialSymbols={symbols} catalog={catalog} />
    </div>
  );
}
