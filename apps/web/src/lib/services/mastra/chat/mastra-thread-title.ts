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

import 'server-only';

/**
 * Web-side entry point for best-effort LLM thread titles.
 *
 * Thin wrapper: injects the validated server env into the shared AI-package
 * orchestration (`@kestrel/ai/mastra`). Never throws.
 *
 * Web chat services await this call before settling the turn's budget
 * reservation (P2-06), so the title LLM call is bounded: on timeout the shared
 * service aborts the call and persists the deterministic fallback title, and
 * no title spend can be recorded after settlement.
 */

import { maybeGenerateThreadTitle as aiMaybeGenerateThreadTitle } from '@kestrel/ai/mastra-v2';

import { getServerEnv } from '@/lib/env';

/** Upper bound the stream tail spends waiting on the title model. */
const WEB_TITLE_TIMEOUT_MS = 2_500;

export type MaybeGenerateThreadTitleArgs = Omit<
  Parameters<typeof aiMaybeGenerateThreadTitle>[0],
  'env'
>;

export async function maybeGenerateThreadTitle(args: MaybeGenerateThreadTitleArgs): Promise<void> {
  return aiMaybeGenerateThreadTitle({
    ...args,
    env: getServerEnv(),
    timeoutMs: args.timeoutMs ?? WEB_TITLE_TIMEOUT_MS,
  });
}
