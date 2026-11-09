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

// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { AISubNav } from '../_components/ai-subnav';
import { updateApiKeysAction } from '../actions';
import { ApiKeysEmptyState } from './_components/api-keys-empty-state';
import { ApiKeysLandingBanner } from './_components/api-keys-landing-banner';
import { ExportImportKeys } from './_components/export-import-keys';
import { MarketDataConfig } from './_components/market-data-config';
import { ProviderCapabilityMatrix } from './_components/provider-capability-matrix';
import { ProviderHealthPanel } from './_components/provider-health-panel';
import { ProviderKeySections } from './_components/provider-key-sections';
import { SaveBar } from './_components/save-bar';
import { loadApiKeysPageData } from './_lib/load-page-data';

export const dynamic = 'force-dynamic';

/**
 * Default export — the page component. Server-component shell that
 * fetches the catalog and renders the BYOK cards + bulk-test button.
 */
export default async function ApiKeysSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; prompt?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  // Phase A — UX_UPGRADE_PLAN.md item 4. When the user lands here
  // from /chat with no AI provider configured, surface a dismissible
  // banner that explains what to do. The banner also offers a deep
  // link back to /chat carrying the original ?prompt= if any, so
  // "Ask AI" affordances don't lose the user's intent.
  const sp = (await searchParams) ?? {};
  const fromChat = sp.from === 'chat';
  const preservedPrompt = sp.prompt && sp.prompt.trim().length > 0 ? sp.prompt : null;

  // this server component starts outside the API
  // boundary, so every tenant read below must run inside a tenant scope — see
  // `_lib/load-page-data.ts`.
  const {
    effSettings,
    ownSettings,
    configuredKeyIds,
    maskedPreviewByProvider,
    healthByProvider,
    usageByProvider,
    configured,
    available,
    totalConfigured,
    totalFailed,
    totalTurns,
    totalCost,
    lastTestedStr,
  } = await loadApiKeysPageData(session.user.id);

  return (
    <div className="flex max-w-4xl min-w-0 flex-col gap-6">
      {fromChat ? (
        <ApiKeysLandingBanner {...(preservedPrompt ? { prompt: preservedPrompt } : {})} />
      ) : null}

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">AI & Intelligence</h2>
        <p className="text-fg-subtle text-sm">
          Connect your personal AI provider keys and market data adapters (encrypted at rest with
          AES-256-GCM).
        </p>
      </div>

      <AISubNav />

      {/* Premium Provider Health Dashboard */}
      <ProviderHealthPanel
        configured={configured}
        totalConfigured={totalConfigured}
        totalFailed={totalFailed}
        lastTestedStr={lastTestedStr}
        healthByProvider={healthByProvider}
        totalTurns={totalTurns}
        totalCost={totalCost}
      />

      {/* Empty state when no providers are configured. */}
      {totalConfigured === 0 ? <ApiKeysEmptyState /> : null}

      <SaveBar
        action={updateApiKeysAction}
        {...(fromChat && preservedPrompt ? { preservedPrompt } : {})}
      >
        <ProviderKeySections
          configured={configured}
          available={available}
          configuredIds={configuredKeyIds}
          keyPreviews={maskedPreviewByProvider}
          keyUpdatedAtByProvider={ownSettings?.aiApiKeysUpdatedAt ?? undefined}
          healthByProvider={healthByProvider}
          usageByProvider={usageByProvider}
        />
      </SaveBar>

      {/* Market Data Provider Configuration */}
      <MarketDataConfig
        initialProvider={effSettings?.marketDataProvider ?? 'biquote'}
        finnhubKeySet={configuredKeyIds.includes('finnhub')}
      />

      {/* Export / Import API Keys */}
      <ExportImportKeys />

      {/* Collapsible Capability Matrix */}
      <ProviderCapabilityMatrix />
    </div>
  );
}
