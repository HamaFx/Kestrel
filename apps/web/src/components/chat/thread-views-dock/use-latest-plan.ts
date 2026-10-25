'use client';

// SPDX-License-Identifier: Apache-2.0

// Newest `data-plan` part in the thread, parsed with the shared schema.
import { UserPlanPartSchema } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import { useMemo } from 'react';
import type { z } from 'zod';

export type LatestPlan = z.output<typeof UserPlanPartSchema> | null;

export function useLatestPlan(messages: UIMessage[]): LatestPlan {
  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg) continue;
      const rawPlan = (msg.parts ?? []).find(
        (p) => p !== null && typeof p === 'object' && (p as { type?: string }).type === 'data-plan',
      );
      if (rawPlan) {
        const parsed = UserPlanPartSchema.safeParse(rawPlan);
        if (parsed.success) return parsed.data;
      }
    }
    return null;
  }, [messages]);
}
