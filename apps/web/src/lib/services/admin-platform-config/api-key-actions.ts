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

import { testProviderKey } from '@kestrel/ai';
import {
  createAuditLog,
  deleteProviderTestResult,
  mergeUserByokKeys,
  recordProviderTestResult,
  removeUserByokKey,
} from '@kestrel/db';
import { PROVIDER_IDS, type ProviderId } from '@kestrel/shared/encryption';

import type { AdminUser } from '@/lib/auth/admin-auth';

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
  const testResult = await testProviderKey(providerId, apiKey);

  // The vault write and its provider-health row commit together, so a health
  // badge can never describe a key the vault did not keep.
  await mergeUserByokKeys(
    targetUserId,
    { set: { [providerId]: apiKey } },
    {
      db,
      tenantId,
      afterWrite: async (tx) => {
        await recordProviderTestResult(
          targetUserId,
          {
            providerId,
            ok: testResult.ok,
            error: testResult.ok ? null : (testResult.error ?? 'Connection check failed'),
          },
          { db: tx, tenantId },
        );
      },
    },
  );

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

export async function clearApiKeyAction(
  ctx: PlatformConfigContext,
  user: AdminUser,
  body: Extract<PlatformConfigPatch, { action: 'clear_api_key' }>,
): Promise<Response> {
  const { db, targetUserId, tenantId } = ctx;
  const providerId = body.providerId as ProviderId;

  await removeUserByokKey(targetUserId, providerId, {
    db,
    tenantId,
    afterWrite: async (tx) => {
      await deleteProviderTestResult(targetUserId, providerId, { db: tx, tenantId });
    },
  });

  await createAuditLog(user.userId, 'admin.platform_config.clear_api_key', {
    providerId,
  });

  return Response.json({ ok: true });
}
