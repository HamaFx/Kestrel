'use client';

// SPDX-License-Identifier: Apache-2.0

// A single watchlist row: symbol link, live-tick price flash, sparkline, and
// the AI Copilot / remove actions.
import { priceDecimals, type Symbol, type Tick } from '@kestrel/shared';
import { IconBolt, IconChartLine, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { SparklineCanvas } from '@/components/ui/sparkline-canvas';
import { cn } from '@/lib/formatters/cn';

const FLASH_MS = 600;

type FlashTone = 'bull' | 'bear' | null;

export function WatchRow({
  tick,
  tickVersion,
  buffersRef,
  canRemove,
  onRemove,
}: {
  tick: Tick;
  tickVersion: number;
  buffersRef: MutableRefObject<Map<Symbol, number[]>>;
  canRemove: boolean;
  onRemove: () => void;
}) {
  void tickVersion;
  const buf = buffersRef.current.get(tick.symbol) ?? [];
  const decimals = priceDecimals(tick.symbol);
  const first = buf[0] ?? tick.mid;
  const last = tick.mid;
  const isBull = last >= first;
  const isClosed = tick.marketState === 'closed';

  // Live-tick flash: brief green/red tint behind the price when it moves.
  const [flash, setFlash] = useState<FlashTone>(null);
  const prevMidRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevMidRef.current;
    prevMidRef.current = last;
    if (isClosed || prev === null || prev === last) return;
    setFlash(last > prev ? 'bull' : 'bear');
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [last, isClosed]);

  const aiPrompt = encodeURIComponent(
    `Analyze market structure, key liquidity levels, and intraday trading bias for ${tick.symbol}`,
  );

  return (
    <li className="border-divider group flex items-center justify-between gap-2 border-b py-2.5 last:border-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-col font-mono">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/chart/${tick.symbol}`}
              className="text-fg hover:text-brand flex items-center gap-1.5 text-sm font-bold tracking-tight transition-colors"
              title={`Open ${tick.symbol} chart`}
            >
              <span>{tick.symbol}</span>
              <IconChartLine className="text-fg-subtle size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            {isClosed && (
              <span
                className="text-fg-subtle bg-bg-elev-2 rounded-xs px-1 py-0.5 text-[10px] font-medium uppercase"
                title="Market closed — last price"
              >
                Closed
              </span>
            )}
          </div>
          <span
            className={cn(
              '-mx-1 inline-flex w-fit items-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums transition-all duration-300',
              flash === 'bull' && 'bg-bull/15 text-bull ring-1 ring-bull/40 shadow-[0_0_10px_rgba(63,158,61,0.2)]',
              flash === 'bear' && 'bg-bear/15 text-bear ring-1 ring-bear/40 shadow-[0_0_10px_rgba(224,44,16,0.2)]',
              flash === null && 'text-fg-subtle ring-1 ring-transparent',
            )}
          >
            {last.toFixed(decimals)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {buf.length >= 2 && !isClosed ? (
          <SparklineCanvas
            values={buf}
            tone={isBull ? 'bull' : 'bear'}
            label={`${tick.symbol} trend`}
          />
        ) : (
          <div className="h-6 w-14" aria-hidden />
        )}

        {isClosed ? (
          <span
            className="text-fg-subtle w-4 text-center text-xs font-medium"
            aria-label="Market closed"
            title="Market closed"
          >
            —
          </span>
        ) : (
          <span
            className={cn(
              'w-4 text-center text-xs font-bold tabular-nums',
              isBull ? 'text-bull' : 'text-bear',
            )}
            aria-label={isBull ? 'Trending up' : 'Trending down'}
          >
            {isBull ? '▲' : '▼'}
          </span>
        )}

        {/* 1-Click Ask AI Copilot */}
        <Link
          href={`/chat?prompt=${aiPrompt}`}
          className="text-fg-subtle hover:text-brand hover:bg-brand/10 tactile-press inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-lg p-2 transition-colors active:translate-y-[0.5px]"
          title={`Ask AI Copilot to analyze ${tick.symbol}`}
          aria-label={`Ask AI Copilot to analyze ${tick.symbol}`}
        >
          <IconBolt className="text-brand size-4" />
        </Link>

        {/* Remove symbol button in edit hover */}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-fg-subtle hover:text-danger tactile-press inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-lg p-2 opacity-0 transition-all group-hover:opacity-100 active:translate-y-[0.5px]"
            title={`Remove ${tick.symbol} from watchlist`}
            aria-label={`Remove ${tick.symbol}`}
          >
            <IconX className="size-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
