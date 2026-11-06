'use server';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */
import 'server-only';

import { withUserTenant } from '@kestrel/db';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import {
  AlertCreateSchema,
  createAlertService,
  type AlertCreateInput,
  type AlertDTO,
} from '@/lib/services/alerts';

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function createAlertAction(
  rawInput: AlertCreateInput,
): Promise<ActionResult<{ alert: AlertDTO }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Not authenticated' };
  }

  const parsed = AlertCreateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid alert input' };
  }

  try {
    const result = await withUserTenant(session.user.id, () =>
      createAlertService(session.user.id, parsed.data),
    );
    revalidatePath('/alerts');
    return { ok: true, data: { alert: result.alert } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to create alert' };
  }
}
