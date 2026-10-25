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

// Premium provider health dashboard rendered at the top of the API keys page.

import { BYOK_PROVIDERS_LIST } from '@kestrel/ai';
import type { ProviderMeta } from '@kestrel/shared';

import { formatRelative } from '@/lib/formatters/format';

import type { ApiKeyHealth } from './api-key-health';
import { BulkTestButton } from './bulk-test-button';

interface ProviderHealthPanelProps {
  configured: ProviderMeta[];
  totalConfigured: number;
  totalFailed: number;
  lastTestedStr: string | null;
  healthByProvider: Map<string, ApiKeyHealth>;
  totalTurns: number;
  totalCost: number;
}

export function ProviderHealthPanel({
  configured,
  totalConfigured,
  totalFailed,
  lastTestedStr,
  healthByProvider,
  totalTurns,
  totalCost,
}: ProviderHealthPanelProps) {
  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {totalConfigured === 0 ? (
            <span className="bg-fg-muted/40 size-3 animate-pulse rounded-full" />
          ) : totalFailed > 0 ? (
            <span className="bg-danger size-3 animate-pulse rounded-full" />
          ) : (
            <span className="bg-success size-3 rounded-full" />
          )}
          <div>
            <h3 className="text-fg text-sm font-semibold">
              {totalConfigured === 0
                ? 'No API Keys Configured'
                : totalFailed > 0
                  ? `${totalFailed} Connection Issues Detected`
                  : 'All Configured Providers Functional'}
            </h3>
            <p className="text-caption text-fg-subtle mt-0.5">
              {totalConfigured === 0
                ? 'Please set up at least one provider to start chatting.'
                : lastTestedStr
                  ? `Last checked: ${formatRelative(lastTestedStr)}`
                  : 'Test connection below to verify setup.'}
            </p>
          </div>
        </div>
        <BulkTestButton disabled={totalConfigured === 0} />
      </div>

      {totalFailed > 0 && (
        <div className="border-danger/20 bg-danger/5 text-caption text-danger flex flex-col gap-1.5 rounded-sm border p-3">
          <span className="font-semibold">Failing Connections:</span>
          <ul className="list-disc space-y-1 pl-4">
            {configured
              .filter((p) => {
                const health = healthByProvider.get(p.id);
                return health && !health.ok;
              })
              .map((p) => {
                const health = healthByProvider.get(p.id);
                return (
                  <li key={p.id}>
                    <span className="font-semibold">{p.displayName}</span>:{' '}
                    {health?.error || 'Unknown error'}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <div className="border-border text-caption grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-3">
        <div className="flex flex-col">
          <span className="text-fg-muted">Configured</span>
          <span className="text-fg mt-0.5 text-base font-semibold tabular-nums">
            {totalConfigured} / {BYOK_PROVIDERS_LIST.length}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-fg-muted">Turns (30d)</span>
          <span className="text-fg mt-0.5 text-base font-semibold tabular-nums">{totalTurns}</span>
        </div>
        <div className="col-span-2 flex flex-col sm:col-span-1">
          <span className="text-fg-muted">Spent (30d)</span>
          <span className="text-fg mt-0.5 text-base font-semibold tabular-nums">
            ${totalCost.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
