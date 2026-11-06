// SPDX-License-Identifier: Apache-2.0

// Data loading for Settings → API Keys.
//
// a React Server Component starts outside the API
// boundary, so nothing has set `app.current_tenant`. Under the non-bypass
// application role an unscoped tenant read does not fail — it returns no rows,
// which would render a fully configured account as empty. `withUserTenant`
// opens the scope once and every helper below inherits it.

import { computeUsage, type ProviderBreakdown } from '@kestrel/ai';
import {
  getDb,
  getOwnUserSettings,
  getUserWithSettings,
  requireTenantIdForUser,
  schema,
  withUserTenant,
} from '@kestrel/db';
import type { CatalogResponse } from '@kestrel/shared';
import { decryptByok } from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';

import { buildCatalogForUser } from '@/lib/services/catalog-server';

import type { ApiKeyHealth } from '../_components/api-key-health';
import { buildKeyPreviewMap } from './mask-api-key';

export interface ApiKeysPageData {
  /** Merged settings (platform inheritance applied) — non-secret values only. */
  effSettings: Awaited<ReturnType<typeof getUserWithSettings>>['settings'];
  /** The user's OWN settings row, never the operator's. */
  ownSettings: Awaited<ReturnType<typeof getOwnUserSettings>>;
  /** Provider ids that currently have a stored key. */
  configuredKeyIds: string[];
  /**
   * Display-only masked previews keyed by provider id. Audit R5 / Phase 1:
   * the plaintext never leaves this function; only `••••1a2b`-style masks are
   * serialised into the RSC payload.
   */
  maskedPreviewByProvider: Record<string, string>;
  healthByProvider: Map<string, ApiKeyHealth>;
  usageByProvider: Map<string, { turns: number; costUsd: number }>;
  configured: CatalogResponse['providers'];
  available: CatalogResponse['providers'];
  totalConfigured: number;
  totalFailed: number;
  totalTurns: number;
  totalCost: number;
  lastTestedStr: string | null;
}

export async function loadApiKeysPageData(userId: string): Promise<ApiKeysPageData> {
  return withUserTenant(userId, async () => {
    // The vault fields must come from the user's OWN settings row: the
    // platform-inheritance merge would otherwise pre-fill this editable form
    // with the operator's decrypted provider keys. `effSettings` (merged) is
    // still used for effective non-secret values like the market feed adapter.
    const [{ settings: effSettings }, ownSettings] = await Promise.all([
      getUserWithSettings(userId),
      getOwnUserSettings(userId),
    ]);

    // decrypt server-side ONLY to learn which providers
    // have a key. The plaintext is used to build an id list and is never passed
    // to a component, so it cannot end up in the RSC payload.
    const ownKeyPayload = ownSettings?.aiApiKeys ? decryptByok(ownSettings.aiApiKeys) : null;
    const configuredKeyIds = ownKeyPayload
      ? Object.entries(ownKeyPayload)
          .filter(([, v]) => typeof v === 'string' && v.length > 0)
          .map(([k]) => k)
      : [];
    const maskedPreviewByProvider = buildKeyPreviewMap(ownKeyPayload);

    // Phase A — UX_UPGRADE_PLAN.md item 7. Load the latest health snapshot per
    // provider so the badge can render without waiting for the user to click
    // "Test". Single round-trip; the row PK is (userId, providerId) so the
    // result is naturally keyed.
    const db = getDb();
    const tenantId = await requireTenantIdForUser(userId, db);
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
        and(eq(schema.providerTests.userId, userId), eq(schema.providerTests.tenantId, tenantId)),
      );
    const healthByProvider = new Map<string, ApiKeyHealth>(
      healthRows.map((h) => [
        h.providerId,
        {
          ok: h.ok,
          error: h.error,
          // testedAt has `mode: 'string'` in the schema, so the value is
          // always a string already — no Date coercion needed.
          testedAt: h.testedAt,
          rateLimit: h.rateLimit,
        },
      ]),
    );

    // Phase D — per-provider usage. We computeUsage once here and map the
    // breakdown by BYOK id so each card receives just the turns + cost for its
    // own provider. No N+1 queries.
    const usage = await computeUsage(userId);
    const usageByProvider = new Map<string, { turns: number; costUsd: number }>();
    for (const p of usage.byProvider as ProviderBreakdown[]) {
      if (p.byokProviderId) {
        usageByProvider.set(p.byokProviderId, { turns: p.turns, costUsd: p.costUsd });
      }
    }

    // Phase E — call the catalog builder directly. RSC pages can't fetch()
    // their own host without a full URL (and APP_URL isn't always set on
    // Vercel), so the route handler and the RSC pages share a
    // `buildCatalogForUser(userId)` helper instead.
    const catalog = await buildCatalogForUser(userId);

    // The catalog endpoint already does the user-overrides merge for
    // defaultModels and the per-provider key/health check. We just filter into
    // configured vs available here.
    const configured = catalog.providers.filter((p) => p.hasKey);
    const available = catalog.providers.filter((p) => !p.hasKey);

    const testedAtTimes = healthRows
      .map((h) => new Date(h.testedAt).getTime())
      .filter((t) => !isNaN(t));
    const lastTestedTime = testedAtTimes.length > 0 ? Math.max(...testedAtTimes) : null;

    return {
      effSettings,
      ownSettings,
      configuredKeyIds,
      maskedPreviewByProvider,
      healthByProvider,
      usageByProvider,
      configured,
      available,
      totalConfigured: configured.length,
      totalFailed: catalog.providers.filter((p) => p.health && !p.health.ok).length,
      totalTurns: usage.thirtyDayTurns,
      totalCost: usage.thirtyDayUsd,
      lastTestedStr: lastTestedTime ? new Date(lastTestedTime).toISOString() : null,
    };
  });
}
