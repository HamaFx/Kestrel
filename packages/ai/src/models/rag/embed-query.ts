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

// Query embedding (DEC-05 split of rag.ts).

import { embedTexts } from '../embeddings';

/**
 * Embed a query string with the same model id stored alongside the corpus
 * (defaults to `AI_EMBEDDING_MODEL` when env is supplied; honours the
 * user's per-user pick from user_settings.embedding_model).
 */
export async function embedQuery(
  query: string,
  options?: {
    aiEmbeddingModel?: string;
    userSettings?: Parameters<typeof embedTexts>[0]['userSettings'];
    signal?: AbortSignal;
  },
): Promise<{ embedding: number[]; model: string }> {
  const args: Parameters<typeof embedTexts>[0] = { texts: [query] };
  if (options?.userSettings) args.userSettings = options.userSettings;
  if (options?.aiEmbeddingModel) args.env = { AI_EMBEDDING_MODEL: options.aiEmbeddingModel };
  if (options?.signal) args.signal = options.signal;
  const r = await embedTexts(args);
  const e = r.embeddings[0];
  if (!e) throw new Error('embedQuery: provider returned no embedding');
  return { embedding: e, model: r.model };
}
