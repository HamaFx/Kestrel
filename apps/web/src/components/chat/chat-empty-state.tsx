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

// Calm, plain-English welcome state for an empty /chat: lets users launch a
// complete 4-angle Deep Analysis, pick a single focused check (Economy, Chart
// Levels, Risk, or Sentiment), or tap a quick market question.
import type { Symbol } from '@kestrel/shared';
import {
  IconArrowRight,
  IconBuildingBank,
  IconChartCandle,
  IconRadar,
  IconScale,
  IconSparkles,
} from '@tabler/icons-react';
import { useMemo } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import type { AnalysisMode } from '@/lib/analysis-mode';
import { FOUR_SPECIALIST_DESKS, type CanonicalDeskId } from '@/lib/kestrel-strategist-desks';

const DEEP_ANALYSIS_PROMPT = (sym: Symbol) =>
  `Run a full trade analysis on ${sym} covering economy, chart levels, risk sizing, and market sentiment.`;

const QUICK_QUERIES = (sym: Symbol) => [
  { label: '4H Trend & Levels', prompt: `Analyze ${sym} 4H trend direction and key price levels` },
  { label: 'Session Highs & Lows', prompt: `Show key session highs, lows, and ranges for ${sym}` },
  { label: 'Interest Rates & USD', prompt: `Check interest rate expectations and USD impact on ${sym}` },
  { label: '1% Risk Calculator', prompt: `Calculate a 1% risk trade setup with stop-loss for ${sym}` },
  { label: 'Institutional Positioning', prompt: `Check institutional COT positioning and sentiment for ${sym}` },
];

function SpecialistIcon({ id }: { id: CanonicalDeskId }) {
  switch (id) {
    case 'fundamental':
      return <IconBuildingBank className="text-info size-4" strokeWidth={1.85} />;
    case 'technical':
      return <IconChartCandle className="text-bull size-4" strokeWidth={1.85} />;
    case 'risk':
      return <IconScale className="text-warn size-4" strokeWidth={1.85} />;
    default:
      return <IconRadar className="text-brand size-4" strokeWidth={1.85} />;
  }
}

export function ChatEmptyState({
  pinnedSymbol,
  disabled,
  onSelect,
}: {
  pinnedSymbol: Symbol | null;
  disabled?: boolean;
  /** `modeOverride` sets the analysis mode for this request (`single` or `full`). */
  onSelect: (text: string, modeOverride?: AnalysisMode) => void;
}) {
  const sym = pinnedSymbol ?? 'XAUUSD';
  const quickQueries = useMemo(() => QUICK_QUERIES(sym), [sym]);

  return (
    <div className="relative flex min-h-[58svh] flex-col items-center justify-center px-3 py-6 select-none sm:px-4 sm:py-8">
      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-5">
        {/* Clean, welcoming header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="border-brand/30 bg-brand/10 text-brand inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold tracking-wider uppercase">
            <IconSparkles className="size-3.5" />
            AI Market Research · {sym}
          </div>
          <h2 className="font-display text-fg text-2xl font-normal tracking-[-0.03em] sm:text-3xl">
            What would you like to analyze?
          </h2>
          <p className="text-fg-muted max-w-lg font-sans text-xs leading-relaxed sm:text-sm">
            Ask any question below, pick a focused topic check, or run a complete 4-angle trade
            analysis on <span className="text-fg font-mono font-semibold">{sym}</span>.
          </p>
        </div>

        {/* Main launcher card */}
        <div className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-[#121315]/95 shadow-xl">
          {/* Primary Deep Analysis CTA */}
          <div className="relative flex flex-col justify-between gap-4 overflow-hidden p-4 sm:flex-row sm:items-center sm:p-5">
            <BlueprintPlate
              id="arbiter"
              variant="watermark"
              className="pointer-events-none absolute -top-6 right-2 z-0 size-36 opacity-20 sm:size-44 sm:opacity-25"
            />
            <div className="relative z-10 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-fg text-sm font-semibold">Deep Trade Analysis</span>
                <span className="border-brand/30 bg-brand/10 text-brand rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase">
                  All 4 Angles Checked
                </span>
              </div>
              <p className="text-fg-muted max-w-xl font-sans text-xs leading-relaxed">
                Checks Economy &amp; News, Chart Price Levels, Risk Sizing, and Market Sentiment at
                the same time to build one complete, risk-checked trade plan.
              </p>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(DEEP_ANALYSIS_PROMPT(sym), 'full')}
              className="tactile-press border-brand/60 bg-brand relative z-10 inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 font-sans text-xs font-semibold text-white shadow-[0_4px_14px_rgba(255,54,22,0.3)] transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
            >
              <span>Run Deep Analysis</span>
              <IconArrowRight className="size-3.5" />
            </button>
          </div>

          {/* 4 Focused Topic Cards */}
          <div className="grid grid-cols-1 divide-y divide-white/[0.06] sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
            {FOUR_SPECIALIST_DESKS.map((desk) => {
              const prompt = desk.defaultPrompt.replace(/XAUUSD/g, sym);
              return (
                <button
                  key={desk.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(prompt, 'single')}
                  className="group relative flex flex-col justify-between gap-3 overflow-hidden bg-[#121315] p-4 text-left transition-colors hover:bg-white/[0.03] active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50"
                >
                  <BlueprintPlate
                    id={desk.blueprintId}
                    variant="watermark"
                    className="pointer-events-none absolute -right-3 -bottom-3 z-0 size-24 opacity-18 transition-opacity duration-300 group-hover:opacity-28 sm:size-28"
                  />
                  <div className="relative z-10 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="bg-bg-elev-2 inline-flex size-8 items-center justify-center rounded-lg border border-white/[0.08]">
                        <SpecialistIcon id={desk.id as CanonicalDeskId} />
                      </span>
                      <span className="text-fg-subtle font-mono text-[10px] font-semibold uppercase">
                        {desk.roleTag}
                      </span>
                    </div>
                    <div>
                      <div className="text-fg text-sm font-semibold">{desk.title}</div>
                      <p className="text-fg-muted mt-1 line-clamp-2 text-xs leading-relaxed">
                        {desk.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-fg-subtle group-hover:text-brand relative z-10 flex items-center justify-between pt-1 font-mono text-[11px] font-medium transition-colors">
                    <span>Quick Check</span>
                    <IconArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Questions Strip */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#101113] px-4 py-3">
            <span className="text-fg-subtle mr-1 font-mono text-[11px] font-medium">
              Quick questions:
            </span>
            {quickQueries.map((query) => (
              <button
                key={query.label}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(query.prompt, 'single')}
                className="border-border/60 text-fg-muted hover:border-brand/40 hover:text-fg inline-flex min-h-8 items-center gap-1 rounded-lg border bg-white/[0.02] px-2.5 py-1 font-sans text-xs transition-colors active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="text-brand">›</span>
                {query.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
