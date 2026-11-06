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

// save_api_key / clear_api_key actions for /api/admin/platform-config.

import { createAuditLog } from '@kestrel/db';
import { PROVIDER_IDS, type ProviderId } from '@kestrel/shared/encryption';

import type { AdminUser } from '@/lib/auth/admin-auth';
import { applyUserApiKeyPatch } from '@/lib/services/settings/user-settings';

import type { PlatformConfigContext } from './context';
import type { PlatformConfigPatch } from './schema';

export async function saveApiKeyAction(
  ctx: PlatformConfigContext,
  user: AdminUser,
  body: Extract<PlatformConfigPatch, { action: 'save_api_key' }>,
): Promise<Response> {
  const { db, targetUserId, tenantId } = ctx;
  const providerId = body.providerId as ProviderId;
  if (!PROVIDER_IDS.includes(providerId)) {
    return Response.json(
      { error: { code: 'VALIDATION', message: `Unknown provider: ${providerId}` } },
      { status: 400 },
    );
  }

  const apiKey = body.apiKey.trim();

  // The vault write and its provider-health row commit together, so a health
  // badge can never describe a key the vault did not keep.
  const outcome = await applyUserApiKeyPatch(
    targetUserId,
    { set: { [providerId]: apiKey } },
    { db, tenantId, testUnchanged: true },
  );
  const check = outcome.checks.find((item) => item.id === providerId && item.action === 'upsert');
  const testOk = check?.ok ?? false;
  const testError = check?.error ?? (testOk ? null : 'Connection check failed');

  await createAuditLog(user.userId, 'admin.platform_config.save_api_key', {
    providerId,
    testOk,
  });

  return Response.json({
    ok: true,
    testOk,
    testError,
  });
}

export async function clearApiKeyAction(
  ctx: PlatformConfigContext,
  user: AdminUser,
  body: Extract<PlatformConfigPatch, { action: 'clear_api_key' }>,
): Promise<Response> {
  const { db, targetUserId, tenantId } = ctx;
  const providerId = body.providerId as ProviderId;

  await applyUserApiKeyPatch(targetUserId, { remove: [providerId] }, { db, tenantId });

  await createAuditLog(user.userId, 'admin.platform_config.clear_api_key', {
    providerId,
  });

  return Response.json({ ok: true });
}
