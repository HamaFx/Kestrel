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

// API route: /api/admin/platform-config
// Unified Admin control plane for managing platform-wide AI provider keys,
// model routing, fallback chains, per-analyst desk overrides, market data feed
// adapters, spend guardrails, and agent tool switches.

import {
  buildToolCatalogue,
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  computeUsage,
  getDb,
  testProviderKey,
  type ProviderBreakdown,
} from '@kestrel/ai';
import {
  createAuditLog,
  getPlatformAdminUserId,
  getUserWithSettings,
  requireTenantIdForUser,
  schema,
} from '@kestrel/db';
import { TOOL_NAMES } from '@kestrel/shared';
import {
  decryptByok,
  encryptByok,
  PROVIDER_IDS,
  type ByokPayload,
  type ProviderId,
} from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { errorResponse, parseJsonBody } from '@/lib/api';
import { buildCatalogForUser } from '@/lib/catalog-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save_api_key'),
    providerId: z.string().min(1),
    apiKey: z.string().min(1),
  }),
  z.object({
    action: z.literal('clear_api_key'),
    providerId: z.string().min(1),
  }),
  z.object({
    action: z.literal('update_routing'),
    chatModel: z.string().nullable().optional(),
    visionModel: z.string().nullable().optional(),
    embeddingModel: z.string().nullable().optional(),
    aiFallbackChain: z.array(z.string()).optional(),
    defaultAnalysisMode: z.enum(['single', 'full']).optional(),
    showAgentOpinions: z.boolean().optional(),
    agentModelOverrides: z.record(z.string(), z.string()).optional(),
    customInstructions: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal('update_market_data'),
    marketDataProvider: z.enum(['biquote', 'finnhub', 'live-ticks']),
  }),
  z.object({
    action: z.literal('update_disabled_tools'),
    disabledTools: z.array(z.string()),
  }),
  z.object({
    action: z.literal('update_budget'),
    monthlyBudgetLimit: z.number().nullable().optional(),
    maxDailyUsd: z.number().nullable().optional(),
  }),
]);

export const GET = withAdminAuth(async (_req, { user }) => {
  try {
    const db = getDb();
    const platformAdminId = (await getPlatformAdminUserId()) ?? user.userId;
    const targetUserId = platformAdminId;
    const tenantId = await requireTenantIdForUser(targetUserId, db);
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
});

export const PATCH = withAdminAuth(async (req, { user }) => {
  try {
    const body = await parseJsonBody(req, PatchSchema);
    const db = getDb();
    const platformAdminId = (await getPlatformAdminUserId()) ?? user.userId;
    const targetUserId = platformAdminId;
    const tenantId = await requireTenantIdForUser(targetUserId, db);

    if (body.action === 'save_api_key') {
      const providerId = body.providerId as ProviderId;
      if (!PROVIDER_IDS.includes(providerId)) {
        return Response.json(
          { error: { code: 'VALIDATION', message: `Unknown provider: ${providerId}` } },
          { status: 400 },
        );
      }

      const [existing] = await db
        .select({
          aiApiKeys: schema.userSettings.aiApiKeys,
          aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
        })
        .from(schema.userSettings)
        .where(
          and(
            eq(schema.userSettings.userId, targetUserId),
            eq(schema.userSettings.tenantId, tenantId),
          ),
        );

      const currentKeys: ByokPayload = {
        ...(existing?.aiApiKeys ? decryptByok(existing.aiApiKeys) : {}),
        [providerId]: body.apiKey.trim(),
      };
      const currentUpdatedAt: Record<string, string> = {
        ...((existing?.aiApiKeysUpdatedAt as Record<string, string> | null) ?? {}),
        [providerId]: new Date().toISOString(),
      };

      const testResult = await testProviderKey(providerId, body.apiKey.trim());
      const testedAt = new Date().toISOString();

      await db.transaction(async (tx) => {
        await tx
          .update(schema.userSettings)
          .set({
            aiApiKeys: encryptByok(currentKeys),
            aiApiKeysUpdatedAt: currentUpdatedAt,
          })
          .where(
            and(
              eq(schema.userSettings.userId, targetUserId),
              eq(schema.userSettings.tenantId, tenantId),
            ),
          );

        await tx
          .delete(schema.providerTests)
          .where(
            and(
              eq(schema.providerTests.userId, targetUserId),
              eq(schema.providerTests.tenantId, tenantId),
              eq(schema.providerTests.providerId, providerId),
            ),
          );

        await tx.insert(schema.providerTests).values({
          userId: targetUserId,
          tenantId,
          providerId,
          ok: testResult.ok,
          error: testResult.ok ? null : (testResult.error ?? 'Connection check failed'),
          testedAt,
        });
      });

      await createAuditLog(user.userId, 'admin.platform_config.save_api_key', {
        providerId,
        testOk: testResult.ok,
      });

      return Response.json({
        ok: true,
        testOk: testResult.ok,
        testError: !testResult.ok ? (testResult.error ?? null) : null,
      });
    }

    if (body.action === 'clear_api_key') {
      const providerId = body.providerId as ProviderId;
      const [existing] = await db
        .select({
          aiApiKeys: schema.userSettings.aiApiKeys,
          aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
        })
        .from(schema.userSettings)
        .where(
          and(
            eq(schema.userSettings.userId, targetUserId),
            eq(schema.userSettings.tenantId, tenantId),
          ),
        );

      const currentKeys: ByokPayload = {
        ...(existing?.aiApiKeys ? decryptByok(existing.aiApiKeys) : {}),
      };
      delete currentKeys[providerId];

      const currentUpdatedAt: Record<string, string> = {
        ...((existing?.aiApiKeysUpdatedAt as Record<string, string> | null) ?? {}),
      };
      delete currentUpdatedAt[providerId];

      await db.transaction(async (tx) => {
        await tx
          .update(schema.userSettings)
          .set({
            aiApiKeys: Object.keys(currentKeys).length > 0 ? encryptByok(currentKeys) : null,
            aiApiKeysUpdatedAt:
              Object.keys(currentUpdatedAt).length > 0 ? currentUpdatedAt : null,
          })
          .where(
            and(
              eq(schema.userSettings.userId, targetUserId),
              eq(schema.userSettings.tenantId, tenantId),
            ),
          );

        await tx
          .delete(schema.providerTests)
          .where(
            and(
              eq(schema.providerTests.userId, targetUserId),
              eq(schema.providerTests.tenantId, tenantId),
              eq(schema.providerTests.providerId, providerId),
            ),
          );
      });

      await createAuditLog(user.userId, 'admin.platform_config.clear_api_key', {
        providerId,
      });

      return Response.json({ ok: true });
    }

    if (body.action === 'update_routing') {
      const updatePayload: Partial<typeof schema.userSettings.$inferInsert> = {};
      if (body.chatModel !== undefined) updatePayload.chatModel = body.chatModel;
      if (body.visionModel !== undefined) updatePayload.visionModel = body.visionModel;
      if (body.embeddingModel !== undefined) updatePayload.embeddingModel = body.embeddingModel;
      if (body.aiFallbackChain !== undefined) updatePayload.aiFallbackChain = body.aiFallbackChain;
      if (body.defaultAnalysisMode !== undefined) {
        updatePayload.defaultAnalysisMode = body.defaultAnalysisMode;
      }
      if (body.showAgentOpinions !== undefined) {
        updatePayload.showAgentOpinions = body.showAgentOpinions;
      }
      if (body.agentModelOverrides !== undefined) {
        updatePayload.agentModelOverrides = body.agentModelOverrides;
      }
      if (body.customInstructions !== undefined) {
        updatePayload.customInstructions = body.customInstructions;
      }

      await db
        .update(schema.userSettings)
        .set(updatePayload)
        .where(
          and(
            eq(schema.userSettings.userId, targetUserId),
            eq(schema.userSettings.tenantId, tenantId),
          ),
        );

      await createAuditLog(user.userId, 'admin.platform_config.update_routing', {
        fields: Object.keys(updatePayload),
      });

      return Response.json({ ok: true });
    }

    if (body.action === 'update_market_data') {
      await db
        .update(schema.userSettings)
        .set({ marketDataProvider: body.marketDataProvider })
        .where(
          and(
            eq(schema.userSettings.userId, targetUserId),
            eq(schema.userSettings.tenantId, tenantId),
          ),
        );

      await createAuditLog(user.userId, 'admin.platform_config.update_market_data', {
        marketDataProvider: body.marketDataProvider,
      });

      return Response.json({ ok: true });
    }

    if (body.action === 'update_disabled_tools') {
      await db
        .update(schema.userSettings)
        .set({ disabledTools: body.disabledTools })
        .where(
          and(
            eq(schema.userSettings.userId, targetUserId),
            eq(schema.userSettings.tenantId, tenantId),
          ),
        );

      await createAuditLog(user.userId, 'admin.platform_config.update_disabled_tools', {
        disabledCount: body.disabledTools.length,
      });

      return Response.json({ ok: true });
    }

    if (body.action === 'update_budget') {
      const updatePayload: Partial<typeof schema.userSettings.$inferInsert> = {};
      if (body.monthlyBudgetLimit !== undefined) {
        updatePayload.monthlyBudgetLimit = body.monthlyBudgetLimit;
      }
      if (body.maxDailyUsd !== undefined) {
        updatePayload.maxDailyUsd = body.maxDailyUsd;
      }

      await db
        .update(schema.userSettings)
        .set(updatePayload)
        .where(
          and(
            eq(schema.userSettings.userId, targetUserId),
            eq(schema.userSettings.tenantId, tenantId),
          ),
        );

      await createAuditLog(user.userId, 'admin.platform_config.update_budget', updatePayload);

      return Response.json({ ok: true });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
