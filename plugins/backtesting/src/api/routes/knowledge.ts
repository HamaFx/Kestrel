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

// Knowledge-base routes backed by per-user plugin storage.

import type { PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import { deleteKnowledge, listKnowledge, readKnowledge, saveKnowledge } from '../../knowledge';
import { KnowledgeKeySchema, KnowledgeSaveInputSchema } from '../../schemas';
import { ApiError, byMethod, execCtx, json, parseBody, wrap } from './shared';

// ── Knowledge base ──────────────────────────────────────────────────────

const listKnowledgeRoute = wrap(async (ctx) => {
  const documents = await listKnowledge(execCtx(ctx));
  return json({ documents });
});

const readKnowledgeRoute = wrap(async (ctx) => {
  const key = ctx.params['key'];
  if (!key) throw new ApiError(400, 'A document key is required.', 'MISSING_KEY');
  const parsedKey = KnowledgeKeySchema.safeParse(key);
  if (!parsedKey.success) throw new ApiError(400, 'Invalid document key.', 'INVALID_KEY');
  const document = await readKnowledge(execCtx(ctx), parsedKey.data);
  if (!document) throw new ApiError(404, 'Knowledge document not found.', 'DOCUMENT_NOT_FOUND');
  return json({ document });
});

const saveKnowledgeRoute = wrap(
  async (ctx) => {
    const input = await parseBody(ctx.request, KnowledgeSaveInputSchema);
    const saved = await saveKnowledge(execCtx(ctx), input);
    return json({ ok: true, document: saved });
  },
  { userErrorStatus: 400 },
);

const deleteKnowledgeRoute = wrap(async (ctx) => {
  const key = ctx.params['key'];
  if (!key) throw new ApiError(400, 'A document key is required.', 'MISSING_KEY');
  const deleted = await deleteKnowledge(execCtx(ctx), key);
  if (!deleted) throw new ApiError(404, 'Knowledge document not found.', 'DOCUMENT_NOT_FOUND');
  return json({ ok: true });
});

export const knowledgeRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/knowledge': byMethod({ GET: listKnowledgeRoute, POST: saveKnowledgeRoute }),
  '/knowledge/:key': byMethod({ GET: readKnowledgeRoute, DELETE: deleteKnowledgeRoute }),
};
