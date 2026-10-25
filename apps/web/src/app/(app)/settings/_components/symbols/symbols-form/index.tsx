'use client';

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
import { CatalogSection } from './catalog-section';
import type { SymbolsFormProps } from './constants';
import { useSymbolsForm } from './use-symbols-form';
import { WatchlistSection } from './watchlist-section';

export function SymbolsForm({ initialSymbols, catalog }: SymbolsFormProps) {
  const controller = useSymbolsForm({ initialSymbols, catalog });

  return (
    <div className="flex flex-col gap-6">
      {/* Watchlist Section */}
      <WatchlistSection controller={controller} />

      {/* Catalog / Suggestions Section */}
      <CatalogSection controller={controller} />
    </div>
  );
}
