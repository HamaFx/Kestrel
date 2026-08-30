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

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { updateUserSettingsField } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProgressSchema = z.object({
  step: z.number().int().min(1).max(5),
  name: z.string().optional(),
  timezone: z.string().optional(),
  defaultSymbol: z.string().optional(),
  selectedProvider: z.string().nullable().optional(),
  tradingStyle: z.enum(['scalper', 'day_trader', 'swing', 'position']).optional(),
  selectedSymbols: z.array(z.string()).optional(),
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const parsed = await parseJsonBody(req, ProgressSchema);

    await updateUserSettingsField(
      user.userId,
      'onboardingProgress',
      parsed as unknown as Record<string, unknown>,
    );

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
