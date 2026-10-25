'use client';

// SPDX-License-Identifier: Apache-2.0

// Phase 5.6 — Error banner naming the dashboard data sources that failed to
// load, with a manual refresh escape hatch.
import { IconAlertTriangle } from '@tabler/icons-react';

import type { DashboardCanvasProps } from './types';

export function FetchErrorBanner({
  hasAnyError,
  fetchErrors,
}: Pick<DashboardCanvasProps, 'hasAnyError' | 'fetchErrors'>) {
  if (!hasAnyError) return null;

  return (
    <div
      className="border-warn/30 bg-warn/5 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm"
      role="alert"
    >
      <IconAlertTriangle className="text-warn size-4 shrink-0" />
      <span className="text-fg-subtle">
        Some dashboard data failed to load. Try{' '}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-fg underline hover:no-underline"
        >
          refreshing
        </button>
        .
        {fetchErrors && (
          <span className="text-fg-muted ml-2 text-xs">
            (
            {Object.entries(fetchErrors)
              .filter(([, v]) => v)
              .map(
                ([k]) =>
                  ({
                    alerts: 'Price Alerts',
                    events: 'Economic Calendar',
                    entries: 'Trade Journal',
                    news: 'Market News',
                    briefing: 'AI Briefing',
                    risk: 'Risk Metrics',
                    settings: 'Settings',
                  })[k] ?? k,
              )
              .join(', ')}
            )
          </span>
        )}
      </span>
    </div>
  );
}
