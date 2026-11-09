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

// Compact AI Analysis Bar for /dashboard: quick symbol selector, 1-click
// focused topic checks, and a primary "Run Deep Analysis" button — keeping the
// dashboard widgets immediately visible above the fold.
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';

import { cn } from '@/lib/formatters/cn';
import { FOUR_SPECIALIST_DESKS } from '@/lib/kestrel-strategist-desks';

const QUICK_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD'] as const;

export function MissionControlDeck() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAUUSD');

  const buildPromptForSymbol = (defaultPrompt: string) =>
    defaultPrompt.replace(/XAUUSD/g, selectedSymbol);

  return (
    <section
      aria-label="Quick AI Market Analysis"
      className="surface-panel flex flex-col gap-3 rounded-xl border border-white/[0.08] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-brand/15 text-brand border-brand/30 inline-flex size-7 items-center justify-center rounded-lg border">
            <IconSparkles className="size-3.5" strokeWidth={2} />
          </span>
          <span className="text-fg text-xs font-semibold tracking-tight">AI Quick Check</span>
        </div>

        <div className="surface-well flex items-center gap-0.5 rounded-lg p-0.5">
          {QUICK_SYMBOLS.map((sym) => {
            const active = selectedSymbol === sym;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => setSelectedSymbol(sym)}
                className={cn(
                  'tactile-press rounded-md px-2 py-1 font-mono text-[11px] font-medium transition-colors',
                  active
                    ? 'surface-chip bg-bg-elev-2 text-brand font-semibold'
                    : 'text-fg-subtle hover:text-fg',
                )}
              >
                {sym}
              </button>
            );
          })}
        </div>

        <div className="bg-border hidden h-4 w-px lg:block" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-1.5">
          {FOUR_SPECIALIST_DESKS.map((desk) => (
            <Link
              key={desk.id}
              href={`/chat?desk=${desk.id}&symbol=${selectedSymbol}&prompt=${encodeURIComponent(buildPromptForSymbol(desk.defaultPrompt))}`}
              className="surface-chip tactile-press text-fg-muted hover:text-fg hover:border-brand/40 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-sans text-xs font-medium transition-colors"
              title={`${desk.title} — ${desk.description}`}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: desk.accentColor }}
              />
              <span>{desk.title}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/chat?mode=full&symbol=${selectedSymbol}&prompt=${encodeURIComponent(`Run a full trade analysis on ${selectedSymbol} covering economy, chart levels, risk sizing, and market sentiment.`)}`}
          className="tactile-press border-brand/60 bg-brand inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold text-white shadow-[0_2px_10px_rgba(255,54,22,0.3),inset_0_1px_0_rgba(255,255,255,0.28)] transition-all hover:brightness-110 sm:w-auto"
        >
          <span>Run Deep Analysis</span>
          <IconArrowRight className="size-3.5" strokeWidth={2} />
        </Link>
      </div>
    </section>
  );
}
