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

// Configured / available provider card lists rendered inside the SaveBar.

import type { ProviderMeta } from '@kestrel/shared';

import { ApiKeyCard } from './api-key-card';
import type { ApiKeyHealth } from './api-key-health';

interface ProviderKeySectionsProps {
  configured: ProviderMeta[];
  available: ProviderMeta[];
  /**
   * Ids that have a stored key (derived server-side). Audit 2026-10-31 (R5):
   * plaintext keys are no longer part of this payload.
   */
  configuredIds: readonly string[];
  /**
   * Display-only masks keyed by provider id. Phase 1 (Task 1.1): the card shows
   * this in the empty input's placeholder instead of prefilling a sentinel.
   */
  keyPreviews: Readonly<Record<string, string>>;
  keyUpdatedAtByProvider: Record<string, string> | undefined;
  healthByProvider: Map<string, ApiKeyHealth>;
  usageByProvider: Map<string, { turns: number; costUsd: number }>;
}

export function ProviderKeySections({
  configured,
  available,
  configuredIds,
  keyPreviews,
  keyUpdatedAtByProvider,
  healthByProvider,
  usageByProvider,
}: ProviderKeySectionsProps) {
  return (
    <>
      {configured.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="configured-providers-heading">
          <h3
            id="configured-providers-heading"
            className="text-fg-subtle text-sm font-medium tracking-wide uppercase"
          >
            Configured
          </h3>
          {configured.map((p) => {
            const health = healthByProvider.get(p.id);
            const u = usageByProvider.get(p.id);
            const keyUpdatedAt = keyUpdatedAtByProvider?.[p.id];
            return (
              <ApiKeyCard
                key={p.id}
                provider={p}
                isConfigured={configuredIds.includes(p.id)}
                maskedPreview={keyPreviews[p.id]}
                keyUpdatedAt={keyUpdatedAt}
                {...(health ? { health } : {})}
                {...(u ? { usage: u } : {})}
              />
            );
          })}
        </section>
      ) : null}

      {available.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="add-provider-heading">
          <h3
            id="add-provider-heading"
            className="text-fg-subtle text-sm font-medium tracking-wide uppercase"
          >
            {configured.length > 0 ? 'Add another' : 'Pick a provider'}
          </h3>
          {available.map((p) => {
            const health = healthByProvider.get(p.id);
            const u = usageByProvider.get(p.id);
            const keyUpdatedAt = keyUpdatedAtByProvider?.[p.id];
            return (
              <ApiKeyCard
                key={p.id}
                provider={p}
                isConfigured={false}
                maskedPreview={keyPreviews[p.id]}
                keyUpdatedAt={keyUpdatedAt}
                {...(health ? { health } : {})}
                {...(u ? { usage: u } : {})}
              />
            );
          })}
        </section>
      ) : null}
    </>
  );
}
