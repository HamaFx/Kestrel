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

// Phase 1.6 — Alerts widget.
//
// Compact list of the user's active alert rules. Mirrors the markup on
// /alerts page but slimmer (max 5 rows, no actions). Links to the full
// alerts page for management.
import type { Alert } from '@kestrel/shared';
import { IconBell } from '@tabler/icons-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

interface AlertsWidgetProps {
  alerts: readonly Alert[];
  limit?: number;
}

function summariseRule(alert: Alert): string {
  const r = alert.rule;
  switch (r.type) {
    case 'priceCross':
      return `${r.direction} ${r.level}`;
    case 'candleClose':
      return `${r.direction} ${r.level} (close)`;
    case 'indicatorCross':
      return `${r.direction} ${r.level} (${r.indicator})`;
  }
}

export function AlertsWidget({ alerts, limit = 5 }: AlertsWidgetProps) {
  const rows = alerts.slice(0, limit);

  return (
    <Card as="section" aria-label="Active alerts">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconBell className="text-fg-subtle size-4" />
          <span className="text-fg text-sm font-semibold">Alerts</span>
          {rows.length > 0 ? (
            <span className="text-fg-subtle text-xs tabular-nums">({rows.length})</span>
          ) : null}
        </div>
        <Link href="/alerts" className="text-fg-subtle hover:text-fg text-xs font-medium">
          Manage
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconBell className="size-5" />}
          title="No alerts set"
          description="Create price or indicator alerts to get notified on your phone or email."
          tone="muted"
          bare
          className="py-4"
        />
      ) : (
        <ul className="flex flex-col">
          {rows.map((a) => (
            <li
              key={a.id}
              className="border-divider flex items-center justify-between gap-3 border-b py-2.5 last:border-0"
            >
              <div className="flex min-w-0 flex-col font-mono">
                <span className="text-fg text-sm font-semibold">{a.rule.symbol}</span>
                <span className="text-fg-subtle truncate text-xs">{summariseRule(a)}</span>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
                  a.active ? 'bg-success/10 text-success' : 'bg-fg-muted/10 text-fg-muted',
                )}
              >
                {a.active ? 'Armed' : 'Paused'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
