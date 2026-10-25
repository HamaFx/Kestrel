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
import { IconCircleCheck, IconCircleX, IconDatabase } from '@tabler/icons-react';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { PlatformConfigController } from './use-platform-config';

const FEEDS = [
  {
    id: 'biquote',
    name: 'BiQuote REST Feed',
    desc: 'Zero-config REST feed for Gold, FX, and Crypto pairs.',
  },
  {
    id: 'finnhub',
    name: 'Finnhub Institutional REST',
    desc: 'High-depth historical candles and multi-timeframe feeds (requires Finnhub key).',
  },
  {
    id: 'live-ticks',
    name: 'Live Ticks Worker Cache',
    desc: 'Low-latency tick worker reading directly from the local database.',
  },
] as const;

export function MarketBudgetSection({ controller }: { controller: PlatformConfigController }) {
  const { data, form, ui, setForm, testMarketProvider, saveMarketData, saveBudget } = controller;
  if (!data) return null;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SettingsSection
        title="3. Live Market Data Feed Adapter"
        description="Select the market data source used for live prices, candles, and technical indicators across all subscribers."
      >
        <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-lg border p-5">
          {FEEDS.map((item) => (
            <label
              key={item.id}
              className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3 text-xs ${
                form.marketProvider === item.id
                  ? 'border-brand bg-brand/10'
                  : 'border-border bg-bg-elev-2/40'
              }`}
            >
              <input
                type="radio"
                name="adminMarketProvider"
                checked={form.marketProvider === item.id}
                onChange={() => setForm({ marketProvider: item.id })}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-fg font-semibold">{item.name}</span>
                <span className="text-fg-subtle">{item.desc}</span>
              </div>
            </label>
          ))}

          {ui.marketTestResult && (
            <div
              className={`flex items-center gap-2 text-xs ${
                ui.marketTestResult.ok ? 'text-success' : 'text-danger'
              }`}
            >
              {ui.marketTestResult.ok ? (
                <IconCircleCheck className="size-4 shrink-0" />
              ) : (
                <IconCircleX className="size-4 shrink-0" />
              )}
              <span>{ui.marketTestResult.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={ui.testingMarket}
              onClick={testMarketProvider}
            >
              <IconDatabase className="mr-1.5 size-3.5" />
              Test Feed
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={ui.savingMarket}
              onClick={saveMarketData}
            >
              Save Feed Adapter
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="4. Platform Spend Guardrails"
        description="Set daily and monthly wholesale LLM spend thresholds for operator alerts and cost governance."
      >
        <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-lg border p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-fg text-xs font-semibold">
              Daily Spend Guardrail (USD / day)
            </label>
            <Input
              type="number"
              step="0.5"
              placeholder="e.g. 25.00"
              value={form.maxDailyUsd}
              onChange={(e) => setForm({ maxDailyUsd: e.target.value })}
            />
            <span className="text-caption text-fg-subtle">
              Current today spend: ${data.budget.todayUsd.toFixed(4)}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-fg text-xs font-semibold">
              Monthly Spend Alert Threshold (USD / month)
            </label>
            <Input
              type="number"
              step="5"
              placeholder="e.g. 500"
              value={form.monthlyBudgetLimit}
              onChange={(e) => setForm({ monthlyBudgetLimit: e.target.value })}
            />
            <span className="text-caption text-fg-subtle">
              Current 30-day spend: ${data.budget.thirtyDayUsd.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={ui.savingBudget}
              onClick={saveBudget}
            >
              Save Spend Guardrails
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
