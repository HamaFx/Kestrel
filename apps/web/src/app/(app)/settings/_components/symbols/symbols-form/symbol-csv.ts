// SPDX-License-Identifier: Apache-2.0

// CSV helpers for the symbols watchlist (import parsing + export download).

/** Split a raw CSV/text input into normalised, de-duplicated symbol tokens. */
export function parseSymbolTokens(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}

/** Trigger a client-side download of the watchlist as a single-column CSV. */
export function downloadWatchlistCsv(symbols: string[]): void {
  const csvContent = 'data:text/csv;charset=utf-8,' + symbols.join(',');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'kestrel_watchlist.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
