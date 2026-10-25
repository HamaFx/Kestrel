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
import { IconRefresh, IconShieldLock } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

import type { PlatformConfigController } from './use-platform-config';

export function PlatformTelemetryBanner({ controller }: { controller: PlatformConfigController }) {
  const { data, ui, bulkTestProviders } = controller;
  if (!data) return null;
  const configuredProviders = data.providers.filter((p) => p.hasKey);

  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand/15 text-brand flex size-10 items-center justify-center rounded-lg border border-amber-400/20">
            <IconShieldLock className="size-5" />
          </div>
          <div>
            <h2 className="text-fg text-base font-semibold">
              Global SaaS AI & Market Data Control Plane
            </h2>
            <p className="text-caption text-fg-subtle">
              Keys, model routing, market data feeds, and tool switches configured here power all
              subscriber accounts across Kestrel.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={ui.bulkTesting}
          disabled={configuredProviders.length === 0}
          onClick={bulkTestProviders}
        >
          <IconRefresh className="mr-1.5 size-3.5" />
          Test All Providers
        </Button>
      </div>

      <div className="border-border grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-caption text-fg-muted">Active AI Providers</span>
          <span className="text-fg mt-0.5 text-lg font-semibold tabular-nums">
            {configuredProviders.length} / {data.providers.length}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-caption text-fg-muted">Platform Turns (Today / 30d)</span>
          <span className="text-fg mt-0.5 text-lg font-semibold tabular-nums">
            {data.budget.todayTurns} / {data.budget.thirtyDayTurns}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-caption text-fg-muted">Platform API Spend (Today)</span>
          <span className="text-fg mt-0.5 font-mono text-lg font-semibold tabular-nums">
            ${data.budget.todayUsd.toFixed(4)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-caption text-fg-muted">Platform API Spend (30d)</span>
          <span className="text-fg mt-0.5 font-mono text-lg font-semibold tabular-nums">
            ${data.budget.thirtyDayUsd.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
