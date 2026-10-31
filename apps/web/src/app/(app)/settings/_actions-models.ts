'use server';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */
import 'server-only';

// Audit 2026-10-31 (R1): server actions run outside the page's tenant scope.
// `user_settings` has RLS, so every helper call below is wrapped in
// `withUserTenant` — the helper's own getDb() then resolves the scoped client.
import { requireTenantIdForUser, schema, withUserTenant } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import {
  BYOK_PROVIDERS,
  updateUserSettingsField,
  type ProviderId,
} from '@/lib/services/api-boundary';

import type { ActionResult } from './_actions-shared';

export async function updateChatModelAction(
  providerId: ProviderId,
  modelId: string,
): Promise<ActionResult<{ chatModel: string | null }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) {
    return { ok: false, error: `Unknown provider: ${providerId}` };
  }

  const bareModelId = modelId.startsWith(`${providerId}/`)
    ? modelId.slice(providerId.length + 1)
    : modelId;

  const value = `${providerId}:${bareModelId}`;

  try {
    await withUserTenant(session.user.id, () =>
      updateUserSettingsField(session.user.id, 'chatModel', value),
    );
    revalidatePath('/settings');
    return { ok: true, data: { chatModel: value } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update chat model' };
  }
}

export async function clearChatModelAction(): Promise<ActionResult<{ chatModel: null }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    await withUserTenant(session.user.id, () =>
      updateUserSettingsField(session.user.id, 'chatModel', null),
    );
    revalidatePath('/settings');
    return { ok: true, data: { chatModel: null } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reset chat model' };
  }
}

export async function resetOnboardingAction(
  options: { soft?: boolean } = {},
): Promise<ActionResult<{ reset: boolean }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    await withUserTenant(session.user.id, async (scopedDb) => {
      const tenantId = await requireTenantIdForUser(session.user.id, scopedDb);
      if (options.soft) {
        await scopedDb
          .update(schema.userSettings)
          .set({ onboardingCompleted: false })
          .where(
            and(
              eq(schema.userSettings.userId, session.user.id),
              eq(schema.userSettings.tenantId, tenantId),
            ),
          );
      } else {
        await scopedDb
          .update(schema.userSettings)
          .set({
            onboardingCompleted: false,
            onboardingProgress: {},
          })
          .where(
            and(
              eq(schema.userSettings.userId, session.user.id),
              eq(schema.userSettings.tenantId, tenantId),
            ),
          );
      }
    });

    revalidatePath('/settings');
    revalidatePath('/onboarding');
    return { ok: true, data: { reset: true } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reset onboarding' };
  }
}
