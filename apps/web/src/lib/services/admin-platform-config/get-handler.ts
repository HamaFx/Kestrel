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

// GET serialization for /api/admin/platform-config: providers (health + usage),
// routing, market data, tools and budget.

import { buildToolCatalogue, computeUsage, type ProviderBreakdown } from '@kestrel/ai';
import { getUserWithSettings, schema } from '@kestrel/db';
import { TOOL_NAMES } from '@kestrel/shared';
import { decryptByok, type ProviderId } from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';

import type { AdminUser } from '@/lib/auth/admin-auth';
import { errorResponse } from '@/lib/http/api';
import { buildCatalogForUser } from '@/lib/services/catalog-server';

import { resolvePlatformConfigTarget } from './context';

export async function handleGetPlatformConfig(user: AdminUser): Promise<Response> {
  try {
    const { db, targetUserId, tenantId } = await resolvePlatformConfigTarget(user.userId);
    const [{ settings }, catalog, usage, healthRows] = await Promise.all([
      getUserWithSettings(targetUserId),
      buildCatalogForUser(targetUserId),
      computeUsage(targetUserId),
      db
        .select({
          providerId: schema.providerTests.providerId,
          ok: schema.providerTests.ok,
          error: schema.providerTests.error,
          testedAt: schema.providerTests.testedAt,
        })
        .from(schema.providerTests)
        .where(
          and(
            eq(schema.providerTests.userId, targetUserId),
            eq(schema.providerTests.tenantId, tenantId),
          ),
        ),
    ]);

    const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;
    const updatedAtMap = (settings?.aiApiKeysUpdatedAt ?? {}) as Record<string, string>;
    const healthMap = new Map(healthRows.map((h) => [h.providerId, h]));

    const usageMap = new Map<string, { turns: number; costUsd: number }>();
    for (const p of usage.byProvider as ProviderBreakdown[]) {
      if (p.byokProviderId) {
        usageMap.set(p.byokProviderId, {
          turns: p.turns,
          costUsd: p.costUsd,
        });
      }
    }

    const providers = catalog.providers.map((p) => {
      const h = healthMap.get(p.id) ?? p.health ?? null;
      const u = usageMap.get(p.id) ?? { turns: 0, costUsd: 0 };
      const hasDbKey = Boolean(decrypted?.[p.id as ProviderId]);
      return {
        id: p.id,
        displayName: p.displayName,
        hasKey: p.hasKey,
        hasDbKey,
        updatedAt: updatedAtMap[p.id] ?? null,
        health: h
          ? {
              ok: h.ok,
              error: h.error ?? null,
              testedAt: h.testedAt,
            }
          : null,
        usage30d: u,
        models: p.models,
      };
    });

    const disabledTools = settings?.disabledTools ?? [];
    const toolCatalogue = await buildToolCatalogue(disabledTools);

    return Response.json({
      providers,
      routing: {
        chatModel: settings?.chatModel ?? null,
        visionModel: settings?.visionModel ?? null,
        embeddingModel: settings?.embeddingModel ?? null,
        aiFallbackChain: settings?.aiFallbackChain ?? [],
        defaultAnalysisMode:
          settings?.defaultAnalysisMode === 'full' || settings?.defaultAnalysisMode === 'standard'
            ? 'full'
            : 'single',
        showAgentOpinions: settings?.showAgentOpinions ?? true,
        agentModelOverrides: (settings?.agentModelOverrides as Record<string, string> | null) ?? {},
        customInstructions: settings?.customInstructions ?? '',
      },
      marketData: {
        marketDataProvider: settings?.marketDataProvider ?? 'biquote',
        finnhubKeySet: Boolean(decrypted?.finnhub || process.env.FINNHUB_API_KEY),
      },
      tools: {
        catalogue: toolCatalogue,
        disabledTools,
        allTools: TOOL_NAMES,
      },
      budget: {
        monthlyBudgetLimit: settings?.monthlyBudgetLimit ?? null,
        maxDailyUsd: settings?.maxDailyUsd ?? null,
        todayTurns: usage.daily7[usage.daily7.length - 1]?.turns ?? 0,
        todayUsd: usage.todayUsd,
        thirtyDayTurns: usage.thirtyDayTurns,
        thirtyDayUsd: usage.thirtyDayUsd,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
