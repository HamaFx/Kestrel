'use client';

// SPDX-License-Identifier: Apache-2.0

// Institutional execution ledger for /journal: a dense hairline table with a
// compact SL→TP micro-bar per row, and a slide-over inspector that still
// exposes the full entry row (live slider, close form, notes, replay).
import { getSymbolDefinition, type JournalEntry, type Symbol } from '@kestrel/shared';
import { IconAdjustmentsHorizontal, IconZoomIn } from '@tabler/icons-react';
import { useState } from 'react';

import { Button, ButtonGroup } from '@/components/ui/button';
import type { useConfirm } from '@/components/ui/confirm-drawer';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/formatters/cn';

import { EntryRow } from '../entry-row';
import { SetupReplayModal } from '../setup-replay-modal';

type ConfirmFn = ReturnType<typeof useConfirm>[1];

interface ExecutionLedgerProps {
  entries: JournalEntry[];
  timeLabels: Map<string, { openedAt: string; closedAt: string | null }>;
  priceMap: Map<Symbol, number>;
  onClosed: () => void;
  onDeleted: () => void;
  confirm: ConfirmFn;
}

function liveR(entry: JournalEntry, live: number | undefined): number | null {
  if (entry.rMultiple != null && Number.isFinite(entry.rMultiple)) return entry.rMultiple;
  if (!live || entry.stop === null) return null;
  const risk = Math.abs(entry.entry - entry.stop);
  if (risk === 0) return null;
  return (entry.side === 'long' ? live - entry.entry : entry.entry - live) / risk;
}

function cashPnl(entry: JournalEntry, live: number | undefined): number | null {
  const price = live ?? entry.exit;
  if (price === null || price === undefined || entry.size === null) return null;
  const diff = entry.side === 'long' ? price - entry.entry : entry.entry - price;
  return entry.size * getSymbolDefinition(entry.symbol).capabilities.contractSize * diff;
}

function rangePct(entry: JournalEntry, live: number | undefined): number | null {
  if (!live || entry.stop === null || entry.target === null) return null;
  const low = Math.min(entry.stop, entry.target);
  const high = Math.max(entry.stop, entry.target);
  if (high <= low) return null;
  return Math.min(100, Math.max(0, ((live - low) / (high - low)) * 100));
}

function fmtPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 5 });
}

function SideBadge({ side }: { side: JournalEntry['side'] }) {
  return (
    <span
      className={cn(
        'inline-flex rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase',
        side === 'long'
          ? 'border-bull/30 bg-bull/10 text-bull'
          : 'border-bear/30 bg-bear/10 text-bear',
      )}
    >
      {side}
    </span>
  );
}

function RValue({ entry, live }: { entry: JournalEntry; live: number | undefined }) {
  const r = liveR(entry, live);
  if (r === null) return <span className="text-fg-subtle">—</span>;
  return (
    <span
      className={cn(
        'font-mono text-xs font-semibold tabular-nums',
        r >= 0 ? 'text-bull' : 'text-bear',
      )}
    >
      {r >= 0 ? '+' : ''}
      {r.toFixed(2)}R
    </span>
  );
}

function PlanBar({ entry, live }: { entry: JournalEntry; live: number | undefined }) {
  const pct = rangePct(entry, live);
  if (pct === null || entry.stop === null || entry.target === null) {
    return <span className="text-fg-subtle font-mono text-[9px]">No SL/TP</span>;
  }
  return (
    <span className="bg-[#090a0b] border-white/[0.06] relative block h-1.5 w-16 overflow-hidden rounded-full border">
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0',
          entry.side === 'long' ? 'bg-bull/40' : 'bg-bear/40',
        )}
        style={{ width: `${pct}%` }}
      />
      <span
        aria-hidden="true"
        className="bg-brand shadow-[0_0_6px_#ff3616] absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${pct}%` }}
      />
    </span>
  );
}

export function ExecutionLedger({
  entries,
  timeLabels,
  priceMap,
  onClosed,
  onDeleted,
  confirm,
}: ExecutionLedgerProps) {
  const [replayEntry, setReplayEntry] = useState<JournalEntry | null>(null);
  const [managedEntry, setManagedEntry] = useState<JournalEntry | null>(null);

  const openInspector = (entry: JournalEntry) => setManagedEntry(entry);

  return (
    <>
      {/* Desktop ledger */}
      <div className="hidden overflow-hidden rounded-xl border border-white/[0.08] md:block">
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Date</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Entry → Exit</TableHead>
              <TableHead>Stop / Target</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead numeric>R</TableHead>
              <TableHead numeric>P&amp;L</TableHead>
              <TableHead numeric>Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const labels = timeLabels.get(entry.id);
              const live = priceMap.get(entry.symbol);
              const pnl = cashPnl(entry, live);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="text-fg-subtle font-mono text-[10px] whitespace-nowrap tabular-nums">
                    {labels?.openedAt ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span className="text-fg font-mono text-xs font-semibold">{entry.symbol}</span>
                  </TableCell>
                  <TableCell>
                    <SideBadge side={entry.side} />
                  </TableCell>
                  <TableCell className="font-mono text-[11px] tabular-nums">
                    <span className="text-fg-muted">{fmtPrice(entry.entry)}</span>
                    <span className="text-fg-subtle/60 mx-1">→</span>
                    <span className="text-fg">{fmtPrice(entry.exit)}</span>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] tabular-nums">
                    <span className="text-bear">{fmtPrice(entry.stop)}</span>
                    <span className="text-fg-subtle/60 mx-1">/</span>
                    <span className="text-bull">{fmtPrice(entry.target)}</span>
                  </TableCell>
                  <TableCell>
                    <PlanBar entry={entry} live={live} />
                  </TableCell>
                  <TableCell numeric>
                    <RValue entry={entry} live={live} />
                  </TableCell>
                  <TableCell numeric className="text-[10px]">
                    {pnl === null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className={pnl >= 0 ? 'text-bull' : 'text-bear'}>
                        {pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(2)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    <div className="flex items-center justify-end">
                      <ButtonGroup>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setReplayEntry(entry)}
                          aria-label={`Replay ${entry.symbol} setup`}
                          title="Inspect / replay setup"
                          className="hover:text-brand"
                        >
                          <IconZoomIn className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openInspector(entry)}
                          aria-label={`Manage ${entry.symbol} entry`}
                          title="Manage entry"
                        >
                          <IconAdjustmentsHorizontal className="size-3.5" />
                        </Button>
                      </ButtonGroup>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile compact ledger */}
      <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#121315] md:hidden">
        {entries.map((entry) => {
          const labels = timeLabels.get(entry.id);
          const live = priceMap.get(entry.symbol);
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => openInspector(entry)}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SideBadge side={entry.side} />
                  <span className="text-fg font-mono text-xs font-semibold">{entry.symbol}</span>
                  <span className="text-fg-subtle truncate font-mono text-[9px]">
                    {labels?.openedAt ?? ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <RValue entry={entry} live={live} />
                  <PlanBar entry={entry} live={live} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <SetupReplayModal
        entry={replayEntry}
        open={replayEntry !== null}
        onOpenChange={(open) => {
          if (!open) setReplayEntry(null);
        }}
      />

      <Drawer
        open={managedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setManagedEntry(null);
        }}
      >
        <DrawerContent className="max-h-[92vh] overflow-y-auto p-4">
          <DrawerHeader className="px-0 pt-0 pb-3">
            <DrawerTitle className="font-display text-fg text-base font-normal">
              {managedEntry ? `Manage Execution · ${managedEntry.symbol}` : 'Manage Execution'}
            </DrawerTitle>
            <DrawerDescription className="text-fg-subtle text-xs">
              Adjust levels, close position, edit notes, or run AI post-trade review.
            </DrawerDescription>
          </DrawerHeader>
          {managedEntry ? (
            <ul>
              <EntryRow
                entry={managedEntry}
                openedAtLabel={timeLabels.get(managedEntry.id)?.openedAt ?? ''}
                closedAtLabel={timeLabels.get(managedEntry.id)?.closedAt ?? ''}
                livePrice={priceMap.get(managedEntry.symbol)}
                onClosed={onClosed}
                onDeleted={() => {
                  setManagedEntry(null);
                  onDeleted();
                }}
                confirm={confirm}
              />
            </ul>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
