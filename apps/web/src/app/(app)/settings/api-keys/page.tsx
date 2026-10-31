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

import { computeUsage, type ProviderBreakdown } from '@kestrel/ai';
import {
  getDb,
  getOwnUserSettings,
  getUserWithSettings,
  requireTenantIdForUser,
  schema,
} from '@kestrel/db';
import { decryptByok } from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { buildCatalogForUser } from '@/lib/services/catalog-server';

import { AISubNav } from '../_components/ai-subnav';
import { updateApiKeysAction } from '../actions';
import type { ApiKeyHealth } from './_components/api-key-health';
import { ApiKeysEmptyState } from './_components/api-keys-empty-state';
import { ApiKeysLandingBanner } from './_components/api-keys-landing-banner';
import { ExportImportKeys } from './_components/export-import-keys';
import { JevDecisionKeysCard } from './_components/jev-decision-keys-card';
import { MarketDataConfig } from './_components/market-data-config';
import { ProviderCapabilityMatrix } from './_components/provider-capability-matrix';
import { ProviderHealthPanel } from './_components/provider-health-panel';
import { ProviderKeySections } from './_components/provider-key-sections';
import { SaveBar } from './_components/save-bar';

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

  // The vault fields must come from the user's OWN settings row: the
  // platform-inheritance merge would otherwise pre-fill this editable form
  // with the operator's decrypted provider keys. `effSettings` (merged) is
  // still used for effective non-secret values like the market feed adapter.
  const [{ settings: effSettings }, ownSettings] = await Promise.all([
    getUserWithSettings(session.user.id),
    getOwnUserSettings(session.user.id),
  ]);

  const decrypted = ownSettings?.aiApiKeys ? decryptByok(ownSettings.aiApiKeys) : null;

  // Phase A — UX_UPGRADE_PLAN.md item 7. Load the latest health
  // snapshot per provider so the badge can render without waiting
  // for the user to click "Test". Single round-trip; the row PK
  // is (userId, providerId) so the result is naturally keyed.
  const db = getDb();
  const tenantId = await requireTenantIdForUser(session.user.id, db);
  const healthRows = await db
    .select({
      providerId: schema.providerTests.providerId,
      ok: schema.providerTests.ok,
      error: schema.providerTests.error,
      testedAt: schema.providerTests.testedAt,
      rateLimit: schema.providerTests.rateLimit,
    })
    .from(schema.providerTests)
    .where(
      and(
        eq(schema.providerTests.userId, session.user.id),
        eq(schema.providerTests.tenantId, tenantId),
      ),
    );
  const healthByProvider = new Map<string, ApiKeyHealth>(
    healthRows.map((h) => [
      h.providerId,
      {
        ok: h.ok,
        error: h.error,
        // testedAt has `mode: 'string'` in the schema, so the value
        // is always a string already — no Date coercion needed.
        testedAt: h.testedAt,
        rateLimit: h.rateLimit,
      },
    ]),
  );

  // Phase D — per-provider usage. We computeUsage once here and
  // map the breakdown by BYOK id so each card receives just the
  // turns + cost for its own provider. No N+1 queries.
  const usage = await computeUsage(session.user.id);
  const usageByProvider = new Map<string, { turns: number; costUsd: number }>();
  for (const p of usage.byProvider as ProviderBreakdown[]) {
    if (p.byokProviderId) {
      usageByProvider.set(p.byokProviderId, {
        turns: p.turns,
        costUsd: p.costUsd,
      });
    }
  }

  // Phase E — call the catalog builder directly. RSC pages can't
  // fetch() their own host without a full URL (and APP_URL isn't
  // always set on Vercel), so the route handler and the RSC pages
  // share a `buildCatalogForUser(userId)` helper instead.
  const catalog = await buildCatalogForUser(session.user.id);

  // The catalog endpoint already does the user-overrides merge for
  // defaultModels and the per-provider key/health check. We just
  // filter into configured vs available here.
  const configured = catalog.providers.filter((p) => p.hasKey);
  const available = catalog.providers.filter((p) => !p.hasKey);

  const totalConfigured = configured.length;
  const totalFailed = catalog.providers.filter((p) => p.health && !p.health.ok).length;
  const totalTurns = usage.thirtyDayTurns;
  const totalCost = usage.thirtyDayUsd;

  const testedAtTimes = healthRows
    .map((h) => new Date(h.testedAt).getTime())
    .filter((t) => !isNaN(t));
  const lastTestedTime = testedAtTimes.length > 0 ? Math.max(...testedAtTimes) : null;
  const lastTestedStr = lastTestedTime ? new Date(lastTestedTime).toISOString() : null;

  return (
    <div className="flex max-w-2xl min-w-0 flex-col gap-6">
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
          decrypted={decrypted}
          keyUpdatedAtByProvider={ownSettings?.aiApiKeysUpdatedAt ?? undefined}
          healthByProvider={healthByProvider}
          usageByProvider={usageByProvider}
        />
      </SaveBar>

      {/* Decision 4A — Jev System One decision-model keys. */}
      <JevDecisionKeysCard
        initialKeys={{
          opencode: !!decrypted?.opencode,
          liquid: !!decrypted?.liquid,
          typesafe: !!decrypted?.typesafe,
        }}
      />

      {/* Market Data Provider Configuration */}
      <MarketDataConfig
        initialProvider={effSettings?.marketDataProvider ?? 'biquote'}
        finnhubKeySet={!!decrypted?.finnhub}
      />

      {/* Export / Import API Keys */}
      <ExportImportKeys />

      {/* Collapsible Capability Matrix */}
      <ProviderCapabilityMatrix />
    </div>
  );
}
