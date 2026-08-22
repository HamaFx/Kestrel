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
import { isKnownSymbol } from '@kestrel/shared';
import { IconDownload, IconFileSpreadsheet, IconUpload, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { apiMutate } from '@/lib/api-client';
import { cn } from '@/lib/cn';

interface ParsedTrade {
  symbol: string;
  side: 'long' | 'short';
  entry: number;
  stop: number | null;
  target: number | null;
  exit: number | null;
  size: number | null;
  openedAt: number;
  closedAt: number | null;
  notes: string | null;
}

export function ImportTrades({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedTrade[] | null>(null);
  const [importing, setImporting] = useState(false);

  function parseCSV(text: string): ParsedTrade[] {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const results: ParsedTrade[] = [];

    for (const line of lines) {
      const cols = line.split(',').map((c) => c.trim());
      if (cols.length < 4) continue;
      const symbol = cols[0]!.toUpperCase();
      if (!isKnownSymbol(symbol)) continue;
      const side = cols[1]!.toLowerCase() === 'sell' ? 'short' : 'long';
      const entry = Number(cols[2]);
      if (!Number.isFinite(entry) || entry <= 0) continue;
      const openedAt = cols[3] ? new Date(cols[3]).getTime() : Date.now();
      if (!Number.isFinite(openedAt)) continue;
      const exit = cols[4] ? Number(cols[4]) : null;
      const stop = cols[5] ? Number(cols[5]) : null;
      const target = cols[6] ? Number(cols[6]) : null;
      const size = cols[7] ? Number(cols[7]) : null;
      // Parse closedAt if present (column 8: closed date)
      const closedAtRaw = cols[8] ? new Date(cols[8]).getTime() : NaN;
      const closedAt = Number.isFinite(closedAtRaw) ? closedAtRaw : null;
      const notesRaw = cols[9]?.trim() || null;

      results.push({
        symbol,
        side,
        entry,
        stop: stop && Number.isFinite(stop) ? stop : null,
        target: target && Number.isFinite(target) ? target : null,
        exit: exit && Number.isFinite(exit) ? exit : null,
        size: size && Number.isFinite(size) ? size : null,
        openedAt: Number.isFinite(openedAt) ? openedAt : Date.now(),
        closedAt,
        notes: notesRaw,
      });
    }

    return results;
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const trades = parseCSV(text);
      if (trades.length === 0) {
        toast.error('No valid trades found in file');
        return;
      }
      setParsed(trades);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed || parsed.length === 0) return;
    setImporting(true);
    try {
      const { count } = await apiMutate<{ count: number }>('/api/journal/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trades: parsed }),
      });
      toast.success(`Imported ${count} trades`);
      setParsed(null);
      setOpen(false);
      onImported?.();
    } catch (err) {
      toast.error('Import failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        <IconDownload className="mr-1 size-4" />
        Import trades
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="bg-bg-elev-1 border-border flex max-h-[80vh] w-full flex-col gap-4 overflow-y-auto rounded-sm border p-6 sm:max-w-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-fg text-base font-semibold">Import trades</h3>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setParsed(null);
                }}
                className="text-fg-muted hover:text-fg"
              >
                <IconX className="size-5" />
              </button>
            </div>

            {!parsed ? (
              <div className="flex flex-col gap-3">
                <p className="text-fg-subtle text-sm">
                  Upload a CSV file with columns:{' '}
                  <code className="text-fg text-xs">
                    symbol, side, entry, date, exit, stop, target, size, closedDate?, notes?
                  </code>
                </p>
                <label className="border-border text-fg-subtle hover:border-border hover:text-fg flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed p-6 text-sm transition-colors">
                  <IconUpload className="size-5" />
                  Choose CSV file
                  <input
                    type="file"
                    accept=".csv,.xlsx,.html"
                    onChange={handleFile}
                    className="sr-only"
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-fg flex items-center gap-2 text-sm">
                  <IconFileSpreadsheet className="text-fg size-4" />
                  <span className="font-medium">{parsed.length} trades parsed</span>
                </div>
                <div className="border-border max-h-48 overflow-y-auto rounded-sm border">
                  <table className="w-full text-xs tabular-nums">
                    <thead>
                      <tr className="bg-bg-elev-2 text-fg-subtle">
                        <th className="p-2 text-left">Symbol</th>
                        <th className="p-2 text-left">Side</th>
                        <th className="p-2 text-right">Entry</th>
                        <th className="p-2 text-right">Exit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 20).map((t, i) => (
                        <tr key={i} className="border-border border-t">
                          <td className="text-fg p-2">{t.symbol}</td>
                          <td className={cn('p-2', t.side === 'long' ? 'text-bull' : 'text-bear')}>
                            {t.side}
                          </td>
                          <td className="text-fg p-2 text-right">{t.entry}</td>
                          <td className="text-fg p-2 text-right">{t.exit ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.length > 20 && (
                    <p className="text-fg-subtle p-2 text-center text-xs">
                      … and {parsed.length - 20} more
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setParsed(null)}>
                    Choose different file
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleImport}
                    loading={importing}
                    disabled={importing}
                  >
                    Import {parsed.length} trades
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
