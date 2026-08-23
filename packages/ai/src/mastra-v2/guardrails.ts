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

/**
 * Phase 5 guardrails — Mastra input processors applied to every chat-facing
 * agent through `inputProcessors`.
 *
 * - `UnicodeNormalizer`: strips control characters, collapses whitespace, NFC
 *   normalizes user input before it reaches the model.
 * - `PromptInjectionDetector`: LLM-based detection of injection, jailbreak,
 *   and system-override attempts. Uses a fast-tier model resolved via the
 *   existing BYOK resolver. Strategy: `block` on research paths (no partial
 *   answer), `rewrite` on conversation paths (neutralize while preserving
 *   intent).
 *
 * The deterministic regex-based `isMastraPromptUnsafe` in the route remains
 * the zero-cost first line of defense; the LLM detector catches variants the
 * regex missed.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { PromptInjectionDetector, UnicodeNormalizer } from '@mastra/core/processors';
import type { LanguageModel } from 'ai';

import { resolveChatModel } from '../model';
import type { ResolveModelEnv } from '../vertex-factory';

const glog = createCategorizedLogger('ai', { component: 'mastra-guardrails' });

export type GuardrailStrategy = 'block' | 'rewrite';

/**
 * Guardrail availability mode:
 * - `availability`: degrade gracefully when the detector model is unavailable
 * - `strict`: reject the turn when the detector model cannot be loaded
 */
export type GuardrailMode = 'availability' | 'strict';

export interface GuardrailOptions {
  /** User settings for BYOK model resolution. */
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  /** Environment for model resolution. */
  env: ResolveModelEnv;
  /**
   * Injection-handling strategy:
   * - `block`: reject the turn (research paths — no partial answer)
   * - `rewrite`: neutralize the injection while preserving intent (conversation)
   */
  strategy: GuardrailStrategy;
  /**
   * Guardrail availability mode:
   * - `availability` (default): degrade gracefully when the detector model
   *   is unavailable (return normalizer only with a warning).
   * - `strict`: return an error when the detector model cannot be loaded;
   *   the caller must reject the turn.
   */
  mode?: GuardrailMode;
  /** Confidence threshold (0–1). Default: 0.7. */
  threshold?: number;
}

/**
 * Build the Mastra input processors for a chat agent. The outer array places
 * the UnicodeNormalizer first so the detector sees clean text.
 *
 * In `availability` mode (default), returns the normalizer only when no BYOK
 * model is available.  In `strict` mode, throws `GuardrailUnavailableError`
 * so the caller can reject the turn.
 */
export function buildGuardrailInputProcessors(options: GuardrailOptions): {
  processors: Array<UnicodeNormalizer | PromptInjectionDetector>;
  warnings: string[];
  mode: GuardrailMode;
} {
  const mode = options.mode ?? 'availability';
  const warnings: string[] = [];
  const normalizer = new UnicodeNormalizer({
    stripControlChars: true,
    preserveEmojis: true,
    collapseWhitespace: true,
    trim: true,
  });

  let resolution: { model: LanguageModel } | null = null;
  try {
    // Resolve the user's fast-tier model for the injection detector. Fall
    // back to the operator's default if no BYOK key is configured.
    resolution = resolveChatModel(
      { aiApiKeys: options.settings.aiApiKeys, chatModel: options.settings.chatModel },
      options.env,
      'technical',
    );
  } catch (error) {
    metrics.increment('guardrail_degraded_total', { tags: { mode, cause: 'resolve_failed' } });
    glog.warn('PromptInjectionDetector: no model available', {
      error: error instanceof Error ? error.message : String(error),
      mode,
    });
    if (mode === 'strict') {
      throw new GuardrailUnavailableError(
        'Prompt-injection detector model is unavailable and guardrail mode is strict.',
      );
    }
    warnings.push('PromptInjectionDetector: no model available; injection detection disabled');
  }

  if (!resolution) {
    metrics.increment('guardrail_degraded_total', { tags: { mode } });
    if (mode === 'strict') {
      throw new GuardrailUnavailableError(
        'Prompt-injection detector model could not be resolved and guardrail mode is strict.',
      );
    }
    return { processors: [normalizer], warnings, mode };
  }

  const detector = new PromptInjectionDetector({
    model: resolution.model as never,
    threshold: options.threshold ?? 0.7,
    strategy: options.strategy,
    detectionTypes: ['injection', 'jailbreak', 'system-override'],
    lastMessageOnly: true,
    includeScores: true,
    onDetection: (event) => {
      if (event.flagged) {
        glog.warn('Prompt injection detected by LLM guardrail', {
          input: event.input.slice(0, 200),
          strategyApplied: event.strategyApplied,
          reason: event.detectionResult.reason,
          scores: event.detectionResult.categories,
        });
      }
    },
  });

  return { processors: [normalizer, detector], warnings: [], mode };
}

/** Error thrown when strict-mode guardrails cannot load the detector model. */
export class GuardrailUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardrailUnavailableError';
  }
}

/**
 * Convenience — build conversation-path guardrails (rewrite strategy,
 * availability mode — degrades gracefully without the detector).
 */
export function buildConversationGuardrails(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): { processors: Array<UnicodeNormalizer | PromptInjectionDetector>; warnings: string[]; mode: GuardrailMode } {
  return buildGuardrailInputProcessors({ settings, env, strategy: 'rewrite', mode: 'availability' });
}

/**
 * Convenience — build research-path guardrails (block strategy,
 * strict mode — rejects the turn when the detector cannot load).
 */
export function buildResearchGuardrails(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): { processors: Array<UnicodeNormalizer | PromptInjectionDetector>; warnings: string[]; mode: GuardrailMode } {
  return buildGuardrailInputProcessors({ settings, env, strategy: 'block', mode: 'strict' });
}

/**
 * Convenience — build research-path guardrails in availability mode
 * (for callers that handle degradation themselves).
 */
export function buildResearchGuardrailsAvailability(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): { processors: Array<UnicodeNormalizer | PromptInjectionDetector>; warnings: string[]; mode: GuardrailMode } {
  return buildGuardrailInputProcessors({ settings, env, strategy: 'block', mode: 'availability' });
}
