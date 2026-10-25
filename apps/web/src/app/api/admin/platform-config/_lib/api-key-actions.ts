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
import { createAuditLog, schema } from '@kestrel/db';
import {
  decryptByok,
  encryptByok,
  PROVIDER_IDS,
  type ByokPayload,
  type ProviderId,
} from '@kestrel/shared/encryption';
import { and, eq } from 'drizzle-orm';

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

  const [existing] = await db
    .select({
      aiApiKeys: schema.userSettings.aiApiKeys,
      aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
    })
    .from(schema.userSettings)
    .where(
      and(eq(schema.userSettings.userId, targetUserId), eq(schema.userSettings.tenantId, tenantId)),
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

export async function clearApiKeyAction(
  ctx: PlatformConfigContext,
  user: AdminUser,
  body: Extract<PlatformConfigPatch, { action: 'clear_api_key' }>,
): Promise<Response> {
  const { db, targetUserId, tenantId } = ctx;
  const providerId = body.providerId as ProviderId;
  const [existing] = await db
    .select({
      aiApiKeys: schema.userSettings.aiApiKeys,
      aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
    })
    .from(schema.userSettings)
    .where(
      and(eq(schema.userSettings.userId, targetUserId), eq(schema.userSettings.tenantId, tenantId)),
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
        aiApiKeysUpdatedAt: Object.keys(currentUpdatedAt).length > 0 ? currentUpdatedAt : null,
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
