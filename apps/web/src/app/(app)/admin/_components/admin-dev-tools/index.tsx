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
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonCard } from '@/components/ui/skeleton';
import { cn } from '@/lib/formatters/cn';

import { useDevTools } from './use-dev-tools';

export function AdminDevTools() {
  const {
    impEnabled,
    probeLoading,
    impUserId,
    setImpUserId,
    impLoading,
    flushTarget,
    setFlushTarget,
    flushLoading,
    flushResults,
    confirmEl,
    handleImpersonate,
    handleFlush,
  } = useDevTools();

  if (probeLoading) {
    return <SkeletonCard lines={4} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {impEnabled && (
        <SettingsSection
          title="Impersonate"
          description="Sign in as another user for debugging. Only available in dev."
        >
          <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="impersonate-user-id" className="text-sm font-medium">
                Target user ID
              </label>
              <Input
                id="impersonate-user-id"
                type="text"
                placeholder="Enter user ID to impersonate"
                value={impUserId}
                onChange={(e) => setImpUserId(e.target.value)}
              />
            </div>
            <Button variant="danger" loading={impLoading} onClick={() => void handleImpersonate()}>
              Impersonate
            </Button>
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Maintenance" description="Flush caches, locks, and sessions.">
        <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="flush-target" className="shrink-0 text-sm font-medium">
              Target:
            </label>
            <select
              id="flush-target"
              value={flushTarget}
              onChange={(e) => setFlushTarget(e.target.value as typeof flushTarget)}
              className="bg-bg-elev-2 border-border text-fg rounded-sm border px-3 py-2 text-sm"
            >
              <option value="cron_locks">Cron locks</option>
              <option value="cache">Cache</option>
              <option value="sessions">Sessions</option>
              <option value="all">All</option>
            </select>
          </div>
          <Button variant="danger" loading={flushLoading} onClick={() => void handleFlush()}>
            Flush
          </Button>

          {flushResults && (
            <div className="flex flex-col gap-2 pt-2">
              {flushResults.map((r) => (
                <div
                  key={r.target}
                  className={cn(
                    'rounded-sm border px-3 py-2 text-sm',
                    r.status === 'flushed'
                      ? 'border-success/20 bg-success/5 text-success'
                      : 'border-warn/20 bg-warn/5 text-warn',
                  )}
                >
                  <span className="font-medium">{r.target}:</span>{' '}
                  {r.status === 'flushed' ? 'Flushed' : 'Unsupported'}
                  {typeof r.affected === 'number' && <> ({r.affected} affected)</>}
                  {r.reason && <> — {r.reason}</>}
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>
      {confirmEl}
    </div>
  );
}
