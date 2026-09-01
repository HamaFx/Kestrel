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

import {
  IconBolt,
  IconBuildingBank,
  IconChartCandle,
  IconCheck,
  IconChevronRight,
  IconWaveSine,
} from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

import type { TradingStyle } from './wizard-types';

interface WizardStepStyleProps {
  tradingStyle: TradingStyle;
  setTradingStyle: (style: TradingStyle) => void;
  onNext: () => void;
  onBack: () => void;
}

const STYLES = [
  {
    id: 'scalper' as const,
    title: 'Scalper',
    icon: IconBolt,
    timeframe: '1M - 15M',
    desc: 'Capture fast-paced price action and micro-trends.',
  },
  {
    id: 'day_trader' as const,
    title: 'Day Trader',
    icon: IconChartCandle,
    timeframe: '5M - 1H',
    desc: 'Intraday execution with clean daily closes.',
  },
  {
    id: 'swing' as const,
    title: 'Swing Trader',
    icon: IconWaveSine,
    timeframe: '1H - 4H',
    desc: 'Hold positions for days to capture large swings.',
  },
  {
    id: 'position' as const,
    title: 'Position Trader',
    icon: IconBuildingBank,
    timeframe: '1D+',
    desc: 'Macro trends, long-term fundamentals.',
  },
];

export function WizardStepStyle({
  tradingStyle,
  setTradingStyle,
  onNext,
  onBack,
}: WizardStepStyleProps) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 flex flex-col gap-6">
      <div>
        <h2 className="text-fg mb-1 text-xl font-semibold">Choose your Trading Style</h2>
        <p className="text-fg-subtle text-sm">
          This configures default timeframes and shapes AI suggestions.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STYLES.map((style) => {
          const active = tradingStyle === style.id;
          const Icon = style.icon;
          return (
            <button
              key={style.id}
              type="button"
              onClick={() => setTradingStyle(style.id)}
              aria-pressed={active}
              className={`hover:bg-bg-elev-2 relative flex min-h-11 cursor-pointer flex-col gap-1.5 rounded-sm border p-4 text-left transition-all ${
                active
                  ? 'border-brand bg-bg-elev-1 ring-brand ring-1'
                  : 'border-border bg-bg-elev-1 hover:border-fg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-fg inline-flex items-center gap-2 text-sm font-semibold sm:text-base">
                  <Icon className={active ? 'text-brand size-4' : 'text-fg-subtle size-4'} />
                  <span>{style.title}</span>
                </span>
                <span className="bg-bg-elev-2 text-fg-subtle border-border rounded-sm border px-2 py-0.5 font-mono text-xs font-medium">
                  {style.timeframe}
                </span>
              </div>
              <p className="text-fg-subtle text-caption sm:text-body-sm leading-relaxed">
                {style.desc}
              </p>
              {active && (
                <span className="text-brand absolute right-3 bottom-3">
                  <IconCheck className="size-4" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-4">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onNext}>
          Continue <IconChevronRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
