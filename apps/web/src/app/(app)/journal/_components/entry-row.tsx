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
import { getSymbolDefinition, pipSize, type JournalEntry } from '@kestrel/shared';
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconHistory,
  IconPlayerPlay,
  IconTrash,
} from '@tabler/icons-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { useConfirm } from '@/components/ui/confirm-drawer';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

import { deleteJournalEntryAction, updateJournalEntryAction } from '../actions';
import { SetupReplayModal } from './setup-replay-modal';

type ConfirmFn = ReturnType<typeof useConfirm>[1];

interface EntryRowProps {
  entry: JournalEntry;
  openedAtLabel: string;
  closedAtLabel?: string;
  livePrice?: number | undefined;
  onClosed: () => void;
  onDeleted: () => void;
  confirm: ConfirmFn;
}

export function EntryRow({
  entry,
  openedAtLabel,
  closedAtLabel,
  livePrice,
  onClosed,
  onDeleted,
  confirm,
}: EntryRowProps) {
  const [closing, setClosing] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [exit, setExit] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    const exitNum = Number(exit);
    if (!Number.isFinite(exitNum)) {
      setBusy(false);
      setError('Exit must be a number');
      return;
    }
    try {
      const res = await updateJournalEntryAction(entry.id, {
        exit: exitNum,
        closedAt: Date.now(),
      });
      if (!res.ok) {
        throw new Error(res.error ?? 'close failed');
      }
      setClosing(false);
      setExit('');
      onClosed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'close failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this entry?',
      description: `${entry.symbol} ${entry.side} @ ${entry.entry} will be permanently removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteJournalEntryAction(entry.id);
      if (!res.ok) {
        throw new Error(res.error ?? 'delete failed');
      }
      onDeleted();
    } catch {
      // Handled cleanly
    } finally {
      setBusy(false);
    }
  }

  // Calculate Real-Time Live Profit / Loss Metrics
  const liveStats = useMemo(() => {
    if (entry.outcome !== 'open' || !livePrice) return null;

    const diff = entry.side === 'long' ? livePrice - entry.entry : entry.entry - livePrice;

    // Pip calculations: use symbol definition pipSize for correct multiplier
    const pipMultiplier = 1 / pipSize(entry.symbol);
    const pips = diff * pipMultiplier;

    // USD Cash calculations (size = lots)
    // Contract sizes: Gold = 100, Forex = 100000
    let cashPnl = 0;
    if (entry.size !== null) {
      const def = getSymbolDefinition(entry.symbol);
      const isCommodity = def?.currencies?.includes('XAU') ?? false;
      const contractSize = isCommodity ? 100 : 100000;
      cashPnl = entry.size * contractSize * diff;
    }

    // R-multiple calculations
    let rMultiple = 0;
    if (entry.stop !== null) {
      const risk = entry.side === 'long' ? entry.entry - entry.stop : entry.stop - entry.entry;
      rMultiple = risk > 0 ? diff / risk : 0;
    }

    return { pips, cashPnl, rMultiple };
  }, [entry, livePrice]);

  // Compute horizontal slider positioning for Stop Loss and IconTarget
  const sliderPosition = useMemo(() => {
    if (!livePrice || entry.stop === null || entry.target === null) return null;

    const stopPrice = entry.stop;
    const targetPrice = entry.target;

    let percentage = 0;

    if (entry.side === 'long') {
      const range = targetPrice - stopPrice;
      percentage = range > 0 ? ((livePrice - stopPrice) / range) * 100 : 50;
    } else {
      // Short
      const range = stopPrice - targetPrice;
      percentage = range > 0 ? ((stopPrice - livePrice) / range) * 100 : 50;
    }

    // Allow beyond-range values for "beyond stop/target" states
    return Math.min(Math.max(percentage, -20), 120);
  }, [entry, livePrice]);

  const sideColor = entry.side === 'long' ? 'text-bull' : 'text-bear';
  const sideBg = entry.side === 'long' ? 'bg-bull/10 border-bull/20' : 'bg-bear/10 border-bear/20';

  const isWin = entry.outcome === 'win' || (liveStats && liveStats.rMultiple > 0);
  const isLoss = entry.outcome === 'loss' || (liveStats && liveStats.rMultiple < 0);

  const outcomeColor = isWin ? 'text-bull' : isLoss ? 'text-bear' : 'text-fg-muted';

  return (
    <li className="border-border bg-bg-elev-1 hover:border-fg-muted/30 flex flex-col gap-3.5 rounded-sm border p-4 transition-all duration-200 hover:shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Header Row */}
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold tabular-nums">
            <span
              className={cn(
                'text-caption rounded-sm border px-2 py-0.5 font-black tracking-wider uppercase',
                sideBg,
                sideColor,
              )}
            >
              {entry.side}
            </span>
            <span className="text-fg text-base tracking-tight">{entry.symbol}</span>
            <span className="text-fg-muted text-xs font-medium">at</span>
            <span className="text-fg font-extrabold">{entry.entry}</span>

            {/* Sizing lot indicator */}
            {entry.size !== null && (
              <span className="text-caption text-fg-subtle bg-bg-elev-3 border-border/40 rounded-sm border px-1.5 py-0.5 font-medium">
                {entry.size} Lots
              </span>
            )}
          </div>

          {/* Opened & Closed Dates */}
          <p className="text-fg-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
            <span>Opened {openedAtLabel}</span>
            {entry.closedAt && closedAtLabel && (
              <>
                <span className="text-fg-muted/50">·</span>
                <span>Closed {closedAtLabel}</span>
              </>
            )}
          </p>

          {/* Tags Strip */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {entry.tags.map((t) => {
                const psychStyle = {
                  Disciplined: 'bg-bull/15 text-bull border-bull/30 font-semibold',
                  'Plan Followed': 'bg-bull/15 text-bull border-bull/30 font-semibold',
                  FOMO: 'bg-bear/15 text-bear border-bear/30 font-semibold',
                  'Revenge Trade': 'bg-bear/15 text-bear border-bear/30 font-semibold',
                  Hesitant: 'bg-warn/15 text-warn border-warn/30 font-semibold',
                  Chased: 'bg-warn/15 text-warn border-warn/30 font-semibold',
                }[t];

                return (
                  <span
                    key={t}
                    className={cn(
                      'rounded-sm border px-2 py-0.5 text-xs select-none',
                      psychStyle ?? 'bg-bg-elev-1 border-border/40 text-fg-subtle font-mono',
                    )}
                  >
                    #{t}
                  </span>
                );
              })}
            </div>
          )}

          {/* Screenshot thumbnail */}
          {entry.screenshotUrl && (
            <button
              type="button"
              onClick={() => {
                if (entry.screenshotUrl) window.open(entry.screenshotUrl, '_blank');
              }}
              className="mt-1.5 inline-flex"
            >
              <Image
                src={entry.screenshotUrl}
                alt="Trade chart screenshot"
                width={48}
                height={48}
                className="border-border size-12 rounded-sm border object-cover transition-opacity hover:opacity-80"
                unoptimized
              />
            </button>
          )}

          {/* Notes display */}
          {entry.notes && (
            <p className="text-fg-muted border-border/70 mt-1.5 border-l-2 py-0.5 pl-2.5 text-xs leading-[1.4]">
              {entry.notes}
            </p>
          )}
        </div>

        {/* Action Panel / Metrics on Right Side */}
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          {/* Outcome realization display */}
          {entry.outcome === 'open' ? (
            liveStats ? (
              <div className="flex flex-col items-end gap-0.5">
                {/* Live R Multiple */}
                {entry.stop !== null && (
                  <span
                    className={cn(
                      'flex items-center gap-0.5 text-sm font-extrabold tabular-nums',
                      outcomeColor,
                    )}
                  >
                    {liveStats.rMultiple >= 0 ? (
                      <IconArrowUpRight className="size-4" />
                    ) : (
                      <IconArrowDownRight className="size-4" />
                    )}
                    {liveStats.rMultiple >= 0 ? '+' : ''}
                    {liveStats.rMultiple.toFixed(2)}R
                  </span>
                )}
                {/* Live cash value or Pip distance */}
                <span className="text-caption text-fg-muted font-bold tracking-wide tabular-nums">
                  {entry.size !== null
                    ? `${liveStats.cashPnl >= 0 ? '+' : ''}$${liveStats.cashPnl.toFixed(2)}`
                    : `${liveStats.pips >= 0 ? '+' : ''}${liveStats.pips.toFixed(1)} Pips`}
                </span>
              </div>
            ) : (
              <div className="text-fg flex animate-pulse items-center gap-1.5 text-xs font-bold">
                <IconPlayerPlay className="fill-brand size-3" />
                <span>Live polling...</span>
              </div>
            )
          ) : (
            <div className="flex flex-col items-end">
              <span
                className={cn(
                  'bg-bg-elev-3 border-border/40 rounded-sm border px-2 py-0.5 text-xs font-black tracking-wider uppercase',
                  outcomeColor,
                )}
              >
                {entry.outcome}
              </span>
              {entry.rMultiple !== null && (
                <span className={cn('mt-1 text-sm font-extrabold tabular-nums', outcomeColor)}>
                  {entry.rMultiple >= 0 ? '+' : ''}
                  {entry.rMultiple.toFixed(2)}R
                </span>
              )}
            </div>
          )}

          {/* CTA controls */}
          <div className="flex items-center gap-1">
            {entry.outcome === 'open' && !closing && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setClosing(true)}
                className="cursor-pointer"
              >
                Close...
              </Button>
            )}

            {/* Replay Setup Button */}
            <Tooltip label="Replay Setup">
              <button
                type="button"
                aria-label="Replay setup"
                onClick={() => setReplayOpen(true)}
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-sm text-sky-400/80 transition-colors hover:bg-sky-500/10 hover:text-sky-400"
              >
                <IconHistory className="size-4" />
              </button>
            </Tooltip>

            <Tooltip label="Delete Log">
              <button
                type="button"
                aria-label="Delete entry"
                onClick={() => void remove()}
                disabled={busy}
                className="text-bear/75 hover:text-bear hover:bg-bear/10 inline-flex size-9 cursor-pointer items-center justify-center rounded-sm transition-colors disabled:opacity-50"
              >
                <IconTrash className="size-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Real-time Visual SL-to-TP Slider Bar */}
      {entry.outcome === 'open' &&
        entry.stop !== null &&
        entry.target !== null &&
        livePrice &&
        sliderPosition !== null && (
          <div className="border-border/30 animate-in fade-in flex flex-col gap-1.5 border-t pt-3 duration-200">
            <div className="text-fg-subtle flex items-center justify-between text-xs font-bold tracking-wider uppercase">
              <span className="text-bear">SL: {entry.stop}</span>
              <span className="text-fg-muted">Entry: {entry.entry}</span>
              <span className="text-bull">Target: {entry.target}</span>
            </div>

            <div className="bg-bg-elev-3 border-border/20 relative mt-1 flex h-2 w-full items-center overflow-visible rounded-sm border">
              {/* Entry Line Indicator */}
              <div
                style={{
                  left:
                    entry.side === 'long'
                      ? `${((entry.entry - entry.stop) / (entry.target - entry.stop)) * 100}%`
                      : `${((entry.stop - entry.entry) / (entry.stop - entry.target)) * 100}%`,
                }}
                className="bg-warn/80 absolute z-10 h-4 w-0.5"
                title="Entry Price Level"
              />

              {/* Glowing Live Dot */}
              <div
                style={{ left: `${sliderPosition}%` }}
                className={cn(
                  'border-fg absolute z-20 size-3 -translate-x-1/2 rounded-sm border shadow-md transition-all duration-300',
                  isWin
                    ? 'bg-bull animate-pulse shadow-md'
                    : isLoss
                      ? 'bg-bear shadow-md'
                      : 'bg-fg-muted',
                )}
                title={`Live Price: ${livePrice}`}
              />

              {/* Profitable Region Shade */}
              {(() => {
                const entryPct =
                  entry.side === 'long'
                    ? ((entry.entry - entry.stop) / (entry.target - entry.stop)) * 100
                    : ((entry.stop - entry.entry) / (entry.stop - entry.target)) * 100;
                const width =
                  entry.side === 'long' ? sliderPosition - entryPct : entryPct - sliderPosition;
                const shadeLeft = entry.side === 'long' ? entryPct : sliderPosition;
                return (
                  <div
                    style={{
                      left: `${Math.max(shadeLeft, 0)}%`,
                      width: `${Math.abs(Math.max(width, 0))}%`,
                    }}
                    className="bg-bull/10 absolute h-full rounded-r-full"
                  />
                );
              })()}
            </div>
            <div className="text-fg-muted mt-0.5 flex items-center justify-between text-xs font-semibold">
              <span className={sliderPosition < 0 ? 'text-bear font-bold' : ''}>
                {sliderPosition < 0 ? '✦ Beyond stop' : 'Stop Loss boundary'}
              </span>
              <span className={cn('font-bold', outcomeColor)}>Live Price: {livePrice}</span>
              <span className={sliderPosition > 100 ? 'text-bull font-bold' : ''}>
                {sliderPosition > 100 ? '✦ Beyond target' : 'Target boundary'}
              </span>
            </div>
          </div>
        )}

      {/* Manual close input stack */}
      {closing && (
        <div className="border-border flex flex-col gap-3 border-t pt-3">
          <div>
            <label
              className="text-fg-subtle text-caption font-bold tracking-wider uppercase"
              htmlFor={`exit-${entry.id}`}
            >
              Exit Price (Close Trade)
            </label>
            <Input
              id={`exit-${entry.id}`}
              value={exit}
              onChange={(ev) => setExit(ev.target.value)}
              inputMode="decimal"
              autoFocus
              className="focus:border-border/70 mt-1.5"
            />
            {error ? <p className="text-danger mt-2 text-xs font-semibold">{error}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="md"
              onClick={close}
              disabled={busy || !exit}
              className="flex-1"
            >
              Save
            </Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              onClick={() => {
                setClosing(false);
                setExit('');
                setError(null);
              }}
              disabled={busy}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Setup Replay Modal */}
      <SetupReplayModal entry={entry} open={replayOpen} onOpenChange={setReplayOpen} />
    </li>
  );
}
