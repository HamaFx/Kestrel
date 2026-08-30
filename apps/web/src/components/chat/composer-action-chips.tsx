// SPDX-License-Identifier: Apache-2.0

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
import type { Symbol } from '@kestrel/shared';
import {
  IconActivity,
  IconChartBar,
  IconChartLine,
  IconNews,
  IconShieldCheck,
  IconTarget,
} from '@tabler/icons-react';
import { useMemo } from 'react';

import { cn } from '@/lib/cn';

interface ActionChip {
  id: string;
  label: string;
  icon: typeof IconChartBar;
  prompt: string;
}

interface ComposerActionChipsProps {
  pinnedSymbol?: Symbol | null;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function ComposerActionChips({
  pinnedSymbol,
  onSelect,
  disabled,
}: ComposerActionChipsProps) {
  const symbol = pinnedSymbol ?? 'XAUUSD';

  const chips: ActionChip[] = useMemo(
    () => [
      {
        id: 'order-flow',
        label: '15M Order Flow',
        icon: IconActivity,
        prompt: `Analyze 15M order flow, fair value gaps, and current market structure for ${symbol}`,
      },
      {
        id: 'liquidity',
        label: 'Key Liquidity Pools',
        icon: IconTarget,
        prompt: `Where are the key buy-side and sell-side liquidity pools for ${symbol} right now?`,
      },
      {
        id: 'confluence',
        label: '4H → 15M Confluence',
        icon: IconChartLine,
        prompt: `Give a multi-timeframe top-down confluence breakdown for ${symbol} (4H -> 1H -> 15M)`,
      },
      {
        id: 'macro-news',
        label: 'News Impact',
        icon: IconNews,
        prompt: `What high-impact economic events and news releases are affecting ${symbol} today?`,
      },
      {
        id: 'fvg-map',
        label: 'Fair Value Gaps',
        icon: IconChartBar,
        prompt: `Map all active 15M and 1H Fair Value Gaps and imbalance zones for ${symbol}`,
      },
      {
        id: 'risk-check',
        label: 'Risk & Key Levels',
        icon: IconShieldCheck,
        prompt: `What is the logical stop loss placement and trade invalidation level for ${symbol}?`,
      },
    ],
    [symbol],
  );

  return (
    <div className="scrollbar-hide flex w-full items-center gap-1.5 overflow-x-auto py-1.5 select-none">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(chip.prompt)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-all',
              'border-border/70 bg-bg-elev-1/80 text-fg-subtle hover:text-fg hover:border-brand/50 hover:bg-bg-elev-2 active:scale-95',
              'focus-visible:ring-brand focus:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50',
            )}
            title={chip.prompt}
          >
            <Icon className="text-brand size-3.5 shrink-0" />
            <span className="whitespace-nowrap">{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}
