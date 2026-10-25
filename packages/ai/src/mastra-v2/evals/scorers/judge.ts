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

// BYOK judge-model resolution for the LLM-as-judge scorers (DEC-05 split of
// scorers.ts). The judge model is the user's BYOK fast tier, exactly like the
// Phase 5 guardrail detector — no new provider surface.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { LanguageModel } from 'ai';

import type { ResolveModelEnv } from '@ai/models/env-factory';
import { resolveChatModel } from '@ai/models/model';

import { slog } from './log';

/**
 * Resolve the BYOK fast-tier model used as the LLM judge for all scorers.
 * Returns `null` when no model can be resolved (scorers then degrade to
 * skipped with a logged warning — never a thrown error in the hot path).
 */
export function resolveJudgeModel(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): { model: LanguageModel; warnings: string[] } | { model: null; warnings: string[] } {
  const warnings: string[] = [];
  try {
    const resolution = resolveChatModel(settings, env, 'technical');
    return { model: resolution.model as LanguageModel, warnings };
  } catch (error) {
    slog.warn('Eval scorer judge model unavailable; live scoring disabled', {
      error: error instanceof Error ? error.message : String(error),
    });
    warnings.push('Eval scorer judge model unavailable; live scoring disabled');
    return { model: null, warnings };
  }
}
