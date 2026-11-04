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

// SPDX-License-Identifier: Apache-2.0

// Instant symbol preview for chat and news. Hovering a ticker opens a small
// card with the live mid, day change, bid/ask and a recent-tick sparkline,
// plus a link to the full chart. The trigger never changes the chip layout.
import { priceDecimals, type Symbol } from '@kestrel/shared';
import { IconArrowUpRight, IconLoader2 } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Sparkline } from '@/components/ui/sparkline';
import { usePrice } from '@/hooks/use-prices';
import { cn } from '@/lib/formatters/cn';

const CARD_WIDTH = 280;
const CARD_HEIGHT = 188;

export function SymbolHoverCard({ symbol, children }: { symbol: Symbol; children: ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const close = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpen(false), 140);
  };

  const openCard = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - CARD_WIDTH / 2),
      Math.max(8, window.innerWidth - CARD_WIDTH - 8),
    );
    const top = Math.min(
      Math.max(8, rect.bottom + 8),
      Math.max(8, window.innerHeight - CARD_HEIGHT - 8),
    );
    setCoords({ left, top });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') openCard();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch') close();
        }}
      >
        {children}
      </span>
      {mounted && open && coords
        ? createPortal(
            <div
              style={{ left: coords.left, top: coords.top, width: CARD_WIDTH }}
              className="fixed z-[80]"
              onPointerEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
              }}
              onPointerLeave={close}
            >
              <SymbolPreview symbol={symbol} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SymbolPreview({ symbol }: { symbol: Symbol }) {
  const { tick, isLoading } = usePrice(symbol);
  const [mids, setMids] = useState<number[]>([]);
  const decimals = priceDecimals(symbol);

  useEffect(() => {
    if (!tick) return;
    setMids((previous) => [...previous, tick.mid].slice(-16));
  }, [tick]);

  const change = tick?.dayDiffPercent ?? null;
  const isUp = (change ?? 0) >= 0;
  const marketOpen = tick?.marketState !== 'closed';

  return (
    <div
      aria-label={`${symbol} live quote`}
      className="surface-panel border-border/60 rounded-xl border p-3 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-fg font-mono text-sm font-bold tracking-tight">{symbol}</div>
          <div className="text-fg-subtle mt-0.5 flex items-center gap-1.5 font-mono text-[9px] tracking-wider uppercase">
            <span
              className={cn('size-1.5 rounded-full', marketOpen ? 'bg-bull' : 'bg-fg-subtle/50')}
            />
            {marketOpen ? 'Market open' : 'Market closed'}
          </div>
        </div>
        {isLoading && !tick ? (
          <IconLoader2 className="text-fg-subtle size-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        {tick ? (
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
              isUp ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear',
            )}
          >
            {change === null ? '—' : `${isUp ? '+' : ''}${change.toFixed(2)}%`}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-fg font-mono text-xl font-bold tracking-tight tabular-nums">
          {tick ? tick.mid.toFixed(decimals) : '—'}
        </span>
        <span className="text-fg-subtle font-mono text-[10px] tabular-nums">
          {tick ? `B ${tick.bid.toFixed(decimals)} / A ${tick.ask.toFixed(decimals)}` : ''}
        </span>
      </div>

      {mids.length >= 2 ? (
        <Sparkline
          values={mids}
          tone={isUp ? 'bull' : 'bear'}
          variant="area"
          className="mt-2 h-8 w-full"
          label={`${symbol} recent ticks`}
        />
      ) : (
        <div className="surface-well mt-2 h-8 rounded-md" aria-hidden="true" />
      )}

      <div className="border-border/40 mt-2 flex items-center justify-between border-t pt-2">
        <span className="text-fg-subtle font-mono text-[9px] uppercase">
          {tick ? `Updated ${new Date(tick.ts).toISOString().slice(11, 19)} UTC` : 'Live quote'}
        </span>
        <Link
          href={`/chart/${symbol}`}
          className="text-brand hover:text-brand-soft inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold transition-colors"
        >
          Open chart
          <IconArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
