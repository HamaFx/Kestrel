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

// /api/settings/vision-model — Phase D2 user-pickable vision model.
//
// Mirrors the chat-model endpoint exactly but writes to
// user_settings.vision_model. The PUT handler additionally validates
// that the chosen provider supports vision (provider.supports.vision)
// and that the model is in the provider's spec catalog.
//
//   GET    /api/settings/vision-model
//     → { visionModel: "<providerId>:<bareModelId>" | null }
//
//   PUT    /api/settings/vision-model
//     body: { providerId, modelId }
//     → { ok: true, visionModel: "<providerId>:<modelId>" }
//
//   DELETE /api/settings/vision-model
//     → { ok: true, visionModel: null }
//
// Auth: NextAuth session gate. Per-user data only.

import type { ProviderId } from '@kestrel/shared';
import { PROVIDER_IDS } from '@kestrel/shared/encryption';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import {
  getUserWithSettings,
  updateUserSettingsField,
  validateAndSaveUserModel,
} from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBodySchema = z.object({
  providerId: z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]]),
  modelId: z.string().min(1).max(120),
});

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const { settings } = await getUserWithSettings(user.userId);
    return Response.json({ visionModel: settings?.visionModel ?? null });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  let body: z.infer<typeof PutBodySchema>;
  try {
    body = await parseJsonBody(req, PutBodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  try {
    const { model } = await validateAndSaveUserModel(
      user.userId,
      'vision',
      body.providerId,
      body.modelId,
    );
    return Response.json({ ok: true, visionModel: model });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<void>(async (_req, { user }) => {
  try {
    await updateUserSettingsField(user.userId, 'visionModel', null);
    return Response.json({ ok: true, visionModel: null });
  } catch (err) {
    return errorResponse(err);
  }
});
