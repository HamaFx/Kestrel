// SPDX-License-Identifier: Apache-2.0

// Types + constants for the symbols (watchlist) settings form.

import type { SymbolItem } from '../sortable-symbol-row';

export interface SymbolCatalogItem {
  symbol: string;
  name: string;
  category: string;
  isActive: boolean | null;
  sortOrder: number | null;
}

export interface SymbolsFormProps {
  initialSymbols: SymbolItem[];
  catalog: SymbolCatalogItem[];
}

export const CATEGORIES: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'forex', label: 'Forex' },
  { value: 'gold', label: 'Gold' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'indices', label: 'Indices' },
];

export const CATALOG_PAGE_SIZE = 20;
