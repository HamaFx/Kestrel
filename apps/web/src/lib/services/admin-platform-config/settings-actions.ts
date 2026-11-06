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

// update_routing / update_market_data / update_disabled_tools / update_budget
// actions for /api/admin/platform-config.

import { createAuditLog } from '@kestrel/db';

import type { AdminUser } from '@/lib/auth/admin-auth';
import {
  updateUserSettingsFields,
  type UserSettingsPatch,
} from '@/lib/services/settings/user-settings';

import type { PlatformConfigContext } from './context';
import type { PlatformConfigPatch } from './schema';

type Patch = PlatformConfigPatch;

export async function updateRoutingAction(
  ctx: PlatformConfigContext,
  user: AdminUser,
  body: Extract<Patch, { action: 'update_routing' }>,
): Promise<Response> {
  const { db, targetUserId, tenantId } = ctx;
  const updatePayload: UserSettingsPatch = {};
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

  await updateUserSettingsFields(targetUserId, updatePayload, { db, tenantId });

  await createAuditLog(user.userId, 'admin.platform_config.update_routing', {
    fields: Object.keys(updatePayload),
  });

  return Response.json({ ok: true });
}

export async function updateMarketDataAction(
  ctx: PlatformConfigContext,
  user: AdminUser,
  body: Extract<Patch, { action: 'update_market_data' }>,
): Promise<Response> {
  const { db, targetUserId, tenantId } = ctx;
  await updateUserSettingsFields(
    targetUserId,
    { marketDataProvider: body.marketDataProvider },
    { db, tenantId },
  );

  await createAuditLog(user.userId, 'admin.platform_config.update_market_data', {
    marketDataProvider: body.marketDataProvider,
  });

  return Response.json({ ok: true });
}

export async function updateDisabledToolsAction(
  ctx: PlatformConfigContext,
  user: AdminUser,
  body: Extract<Patch, { action: 'update_disabled_tools' }>,
): Promise<Response> {
  const { db, targetUserId, tenantId } = ctx;
  await updateUserSettingsFields(
    targetUserId,
    { disabledTools: body.disabledTools },
    { db, tenantId },
  );

  await createAuditLog(user.userId, 'admin.platform_config.update_disabled_tools', {
    disabledCount: body.disabledTools.length,
  });

  return Response.json({ ok: true });
}

export async function updateBudgetAction(
  ctx: PlatformConfigContext,
  user: AdminUser,
  body: Extract<Patch, { action: 'update_budget' }>,
): Promise<Response> {
  const { db, targetUserId, tenantId } = ctx;
  const updatePayload: UserSettingsPatch = {};
  if (body.maxDailyUsd !== undefined) {
    updatePayload.maxDailyUsd = body.maxDailyUsd;
  }

  await updateUserSettingsFields(targetUserId, updatePayload, { db, tenantId });

  await createAuditLog(user.userId, 'admin.platform_config.update_budget', updatePayload);

  return Response.json({ ok: true });
}
