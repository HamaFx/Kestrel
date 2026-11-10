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
import { fmtMoney, fmtMoneyPlain, PLUGIN_UI_CLASSES, toneClass } from '../format';
import type { Summary } from './use-paper-page';

export function AccountSummary({ summary }: { summary: Summary | null }) {
  return (
    <section role="group" data-slot="kpi-group" className={PLUGIN_UI_CLASSES.kpiGroup}>
      <Stat label="Total equity" value={fmtMoneyPlain(summary?.totalEquity ?? 0)} />
      <div data-slot="kpi" className={PLUGIN_UI_CLASSES.kpiCell}>
        <span data-slot="kpi-label" className={PLUGIN_UI_CLASSES.kpiLabel}>
          Unrealized P&L
        </span>
        <span
          data-slot="kpi-value"
          className={`${PLUGIN_UI_CLASSES.kpiValue} ${toneClass(
            summary?.totalUnrealizedPnl ?? 0,
          )}`}
        >
          {fmtMoney(summary?.totalUnrealizedPnl ?? 0)}
        </span>
      </div>
      <Stat label="Open positions" value={String(summary?.openPositions.length ?? 0)} />
      <Stat label="Pending orders" value={String(summary?.pendingOrders.length ?? 0)} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div data-slot="kpi" className={PLUGIN_UI_CLASSES.kpiCell}>
      <span data-slot="kpi-label" className={PLUGIN_UI_CLASSES.kpiLabel}>
        {label}
      </span>
      <span data-slot="kpi-value" className={`${PLUGIN_UI_CLASSES.kpiValue} text-fg`}>
        {value}
      </span>
    </div>
  );
}
