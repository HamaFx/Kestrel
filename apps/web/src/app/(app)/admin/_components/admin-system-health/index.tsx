// SPDX-License-Identifier: Apache-2.0

// PR-06: System Health dashboard — SLI/SLO monitoring for administrators.
//
// Displays real-time service level indicators, error budget gauges,
// and anomaly alerts. Data comes from /api/admin/health-slo which
// computes everything from existing telemetry tables.

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
import { IconRefresh } from '@tabler/icons-react';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { SkeletonCard } from '@/components/ui/skeleton';
import { cn } from '@/lib/formatters/cn';

import { AdminErrorBlock } from '../admin-error-block';
import { AnomalyList } from './anomaly-list';
import { OverallBanner } from './overall-banner';
import { SliCard } from './sli-card';
import { HEALTH_WINDOWS } from './sli-icons';
import { SpendWatchBar } from './spend-watch-bar';
import { HealthSummaryFooter } from './summary-footer';
import { useSystemHealth } from './use-system-health';

export function AdminSystemHealth() {
  const { data, loading, fetchError, windowHours, setWindowHours, fetchHealth } = useSystemHealth();

  if (loading && !data) {
    return (
      <SettingsSection title="System Health" description="Real-time SLI/SLO monitoring.">
        <SkeletonCard lines={6} />
      </SettingsSection>
    );
  }

  if (fetchError && !data) {
    return (
      <SettingsSection title="System Health" description="Real-time SLI/SLO monitoring.">
        <AdminErrorBlock message={fetchError} onRetry={fetchHealth} />
      </SettingsSection>
    );
  }

  if (!data) return null;

  const activityWindowLabel = data.slis.find((sli) => sli.key === 'cron_jobs')?.window ?? '24h';

  return (
    <SettingsSection
      title="System Health"
      description={`Current worker freshness and recovery health; activity SLIs over the last ${activityWindowLabel}. Refreshes every 30s.`}
    >
      <div className="flex flex-col gap-4">
        {fetchError && (
          <div className="border-warn/25 bg-warn/5 flex items-center justify-between gap-3 rounded-sm border px-3 py-2">
            <p className="text-warn text-xs">
              Refresh failed. Showing the last successful snapshot.
            </p>
            <button
              type="button"
              onClick={() => void fetchHealth()}
              className="text-warn text-xs font-semibold underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="bg-bg-elev-1 border-border flex items-center gap-1 rounded-sm border p-0.5">
            {HEALTH_WINDOWS.map(({ hours, label }) => (
              <button
                key={hours}
                type="button"
                onClick={() => {
                  setWindowHours(hours);
                  void fetchHealth(hours);
                }}
                disabled={loading || hours === windowHours}
                className={cn(
                  'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
                  windowHours === hours
                    ? 'bg-brand text-brand-fg'
                    : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void fetchHealth()}
            disabled={loading}
            className="text-fg-subtle hover:text-fg flex items-center gap-1 text-xs transition-colors"
            aria-label="Refresh health data"
          >
            <IconRefresh className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        </div>
        <OverallBanner data={data} />

        {data.spendWatch && <SpendWatchBar watch={data.spendWatch} />}

        <AnomalyList anomalies={data.anomalies} />

        {/* SLI Cards Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.slis.map((sli) => (
            <SliCard key={sli.key} sli={sli} />
          ))}
        </div>

        {/* Summary Footer */}
        <HealthSummaryFooter data={data} />
      </div>
    </SettingsSection>
  );
}
