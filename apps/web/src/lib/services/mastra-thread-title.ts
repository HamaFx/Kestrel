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
 * orchestration (`@kestrel/ai/mastra`). Fire-and-forget safe — never blocks
 * the chat response and never throws.
 */

import { maybeGenerateThreadTitle as aiMaybeGenerateThreadTitle } from '@kestrel/ai/mastra';

import { getServerEnv } from '@/lib/env';

export type MaybeGenerateThreadTitleArgs = Omit<
  Parameters<typeof aiMaybeGenerateThreadTitle>[0],
  'env'
>;

export async function maybeGenerateThreadTitle(args: MaybeGenerateThreadTitleArgs): Promise<void> {
  return aiMaybeGenerateThreadTitle({ ...args, env: getServerEnv() });
}
