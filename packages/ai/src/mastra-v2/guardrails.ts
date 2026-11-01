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
 * - `IndirectContentGuardrail` (audit R15): a deterministic, provider-boundary
 *   screen over every tool result in the outgoing prompt. Tool output, news,
 *   web-search results, retrieved knowledge, and recalled memory reach the
 *   model as data, and any string carrying embedded instructions is replaced
 *   by the quarantine notice before the model ever sees it. Payloads that
 *   declare `contentTrust: 'untrusted' | 'mixed-untrusted'` also get the
 *   untrusted-data delimiters. This runs on every path, including the
 *   degraded ones, so a missing detector model never means unscreened tool
 *   output.
 *
 * The LLM detector stays scoped to the user turn (`lastMessageOnly`): scoring
 * every historical message would cost one judge call per message per turn.
 * Indirect content is covered by the deterministic screen above plus the
 * model-backed (Jev) snippet screen on the retrieval paths, which carries the
 * strict/conversation posture described in `ContentScreenMode`.
 *
 * The deterministic `isInjectionAttempt` and `isMutationIntent` gates in the
 * route remain the zero-cost first line of defense; the LLM detector catches
 * variants the lexical checks miss.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import {
  PromptInjectionDetector,
  UnicodeNormalizer,
  type InputProcessor,
  type ProcessLLMRequestArgs,
  type ProcessLLMRequestResult,
} from '@mastra/core/processors';
import type { LanguageModel } from 'ai';

import { hashLogValue } from '../diagnostics/redact';
import { createJevGuardrailProcessor } from '../jev/guardrail-processor';
import { resolveJevEndpoint } from '../jev/resolve-endpoint';
import type { JevEnv, ResolvedJevEndpoint } from '../jev/types';
import type { ResolveModelEnv } from '../models/env-factory';
import { resolveChatModel } from '../models/model';
import {
  appendContentScreenEvents,
  asContentScreenReportSink,
  declaresUntrustedContent,
  EXTERNAL_QUARANTINE_NOTICE,
  screenExternalText,
  screenTextValues,
  type ContentScreenEvent,
  type ContentScreenReportSink,
} from './packets/external-content';

const glog = createCategorizedLogger('ai', { component: 'mastra:guardrails' });

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
   * P2-03 (audit 2026-10-18) — a model the caller already resolved for this
   * turn. When provided, the detector reuses it instead of resolving the
   * fast-tier model a second time (mode-runner/canonical pass the run's
   * resolved model). Paths without a pre-resolved model keep the env
   * fallback resolution below.
   */
  model?: LanguageModel;
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
  /**
   * Phase 1 (Jev System One) — a pre-resolved Jev endpoint. When omitted the
   * builder resolves one from `settings.aiApiKeys` / `env`; passing `null`
   * explicitly forces the generative fallback path (tests / hermetic runs).
   */
  jevEndpoint?: ResolvedJevEndpoint | null | undefined;
}

/**
 * Build the Mastra input processors for a chat agent. The outer array places
 * the UnicodeNormalizer first so the detector sees clean text.
 *
 * Phase 1 (Jev): when any Jev provider can be resolved, the fast
 * non-generative `kestrel-jev-guardrail` processor replaces the generative
 * `PromptInjectionDetector` (no prefill/decode, 100% turn coverage). With no
 * Jev provider the previous behavior is unchanged.
 *
 * In `availability` mode (default), returns the normalizer only when no BYOK
 * model and no Jev endpoint are available. In `strict` mode, throws
 * `GuardrailUnavailableError` when neither Jev nor a generative detector
 * model can be resolved, so the caller can reject the turn.
 */
export function buildGuardrailInputProcessors(options: GuardrailOptions): GuardrailBundle {
  const mode = options.mode ?? 'availability';
  const warnings: string[] = [];
  const normalizer = new UnicodeNormalizer({
    stripControlChars: true,
    preserveEmojis: true,
    collapseWhitespace: true,
    trim: true,
  });
  // Audit R15 — tool output, news, web-search results, retrieved knowledge and
  // recalled memory are screened at the provider boundary on every path,
  // including the degraded ones. A missing detector model therefore never
  // means unscreened indirect content.
  const indirect = createIndirectContentGuardrailProcessor({ mode });

  // Phase 1 (Jev System One) — free-first endpoint resolution. Any resolved
  // endpoint (OpenCode free, Vercel Gateway credits, TypeSafe/OpenRouter
  // BYOK) makes the generative detector unnecessary.
  const jevEndpoint =
    options.jevEndpoint !== undefined
      ? options.jevEndpoint
      : resolveJevEndpoint(options.settings, options.env);
  if (jevEndpoint) {
    const env: JevEnv = options.env;
    return {
      processors: [
        normalizer,
        createJevGuardrailProcessor({
          settings: options.settings,
          env,
          strategy: options.strategy,
          threshold: options.threshold ?? 0.7,
          endpoint: jevEndpoint,
          // Fail closed when the detector is unreachable on a strict path.
          mode,
        }),
        indirect,
      ],
      warnings,
      mode,
      indirect,
    };
  }

  let resolution: { model: LanguageModel } | null = options.model ? { model: options.model } : null;
  if (!resolution) {
    try {
      // Resolve the user's fast-tier model for the injection detector. Fall
      // back to the operator's default if no BYOK key is configured. Only
      // reached when the caller did not already resolve a model (P2-03).
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
      warnings.push(
        'PromptInjectionDetector: no model available; user-turn injection detection disabled (indirect tool output is still screened)',
      );
    }
  }

  if (!resolution) {
    metrics.increment('guardrail_degraded_total', { tags: { mode } });
    if (mode === 'strict') {
      throw new GuardrailUnavailableError(
        'Prompt-injection detector model could not be resolved and guardrail mode is strict.',
      );
    }
    return { processors: [normalizer, indirect], warnings, mode, indirect };
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
        // Phase 5 — never persist the raw payload; correlate by stable hash.
        glog.warn('Prompt injection detected by LLM guardrail', {
          inputHash: hashLogValue(event.input),
          strategyApplied: event.strategyApplied,
          reason: event.detectionResult.reason,
          scores: event.detectionResult.categories,
        });
      }
    },
  });

  return { processors: [normalizer, detector, indirect], warnings: [], mode, indirect };
}

/** Error thrown when strict-mode guardrails cannot load the detector model. */
export class GuardrailUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardrailUnavailableError';
  }
}

/** Processor id for the deterministic indirect-content screen. */
export const INDIRECT_CONTENT_PROCESSOR_ID = 'kestrel-indirect-content-guardrail';

type ModelPrompt = ProcessLLMRequestArgs['prompt'];
type ModelPromptMessage = ModelPrompt[number];

interface ToolResultOutputLike {
  type: string;
  value?: unknown;
  [key: string]: unknown;
}

interface ToolResultPartLike {
  type: 'tool-result';
  toolName?: string;
  output?: ToolResultOutputLike;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isToolResultPart(part: unknown): part is ToolResultPartLike {
  return isRecord(part) && part.type === 'tool-result';
}

interface StringScreenStats {
  scanned: number;
  quarantined: number;
  wrapped: number;
  oversizeUntouched: number;
  unscannedNodes: number;
}

const EMPTY_STRING_STATS: StringScreenStats = {
  scanned: 0,
  quarantined: 0,
  wrapped: 0,
  oversizeUntouched: 0,
  unscannedNodes: 0,
};

/** Screen one tool-result output payload, leaving structure intact. */
function screenToolResultOutput(
  output: ToolResultOutputLike,
  untrusted: boolean,
): { output: ToolResultOutputLike; stats: StringScreenStats } {
  if (output.type === 'text' || output.type === 'error-text') {
    const screened = screenExternalText(output.value, { untrusted });
    return {
      output:
        screened.quarantined || screened.wrapped ? { ...output, value: screened.text } : output,
      stats: {
        scanned: 1,
        quarantined: screened.quarantined ? 1 : 0,
        wrapped: screened.wrapped ? 1 : 0,
        oversizeUntouched: 0,
        unscannedNodes: 0,
      },
    };
  }

  if (output.type === 'json' || output.type === 'error-json') {
    const screened = screenTextValues(output.value, { untrusted });
    return {
      output:
        screened.quarantined > 0 || screened.wrapped > 0
          ? { ...output, value: screened.value }
          : output,
      stats: {
        scanned: screened.scanned,
        quarantined: screened.quarantined,
        wrapped: screened.wrapped,
        oversizeUntouched: screened.oversizeUntouched,
        unscannedNodes: screened.unscannedNodes,
      },
    };
  }

  if (output.type === 'content' && Array.isArray(output.value)) {
    // Only text items are screened. Media data stays byte-identical: wrapping
    // or rewriting base64 would corrupt it.
    let scanned = 0;
    let quarantined = 0;
    let changed = false;
    const items = output.value.map((item) => {
      if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string') return item;
      const screened = screenExternalText(item.text, { untrusted: false });
      scanned += 1;
      if (!screened.quarantined) return item;
      quarantined += 1;
      changed = true;
      return { ...item, text: screened.text };
    });
    return {
      output: changed ? { ...output, value: items } : output,
      stats: { scanned, quarantined, wrapped: 0, oversizeUntouched: 0, unscannedNodes: 0 },
    };
  }

  return { output, stats: EMPTY_STRING_STATS };
}

export interface PromptToolScreenResult {
  prompt: ModelPrompt;
  /** True when at least one string was rewritten. */
  changed: boolean;
  toolResults: number;
  untrustedToolResults: number;
  stringsScanned: number;
  stringsQuarantined: number;
  stringsWrapped: number;
  oversizeUntouched: number;
  /** Payload nodes left uninspected because a traversal budget ran out. */
  unscannedNodes: number;
  /** Tool names that carried at least one quarantined string. */
  flaggedTools: string[];
}

/**
 * Screen every tool result in a model-bound prompt (audit R15).
 *
 * Pure and exported for testing: it walks the provider prompt, quarantines
 * instruction-like strings in place, annotates declared-untrusted payloads
 * with the `[UNTRUSTED EXTERNAL DATA]` delimiters, and reports what it did so
 * the run can disclose it.
 */
export function screenPromptToolResults(prompt: ModelPrompt): PromptToolScreenResult {
  let changed = false;
  let toolResults = 0;
  let untrustedToolResults = 0;
  let stringsScanned = 0;
  let stringsQuarantined = 0;
  let stringsWrapped = 0;
  let oversizeUntouched = 0;
  let unscannedNodes = 0;
  const flaggedTools: string[] = [];

  const messages = prompt.map((message) => {
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) return message;
    let messageChanged = false;
    const parts = content.map((part: unknown) => {
      if (!isToolResultPart(part) || !part.output) return part;
      toolResults += 1;
      const untrusted = declaresUntrustedContent(part.output.value);
      if (untrusted) untrustedToolResults += 1;
      const screened = screenToolResultOutput(part.output, untrusted);
      stringsScanned += screened.stats.scanned;
      stringsQuarantined += screened.stats.quarantined;
      stringsWrapped += screened.stats.wrapped;
      oversizeUntouched += screened.stats.oversizeUntouched;
      unscannedNodes += screened.stats.unscannedNodes;
      if (screened.output === part.output) return part;
      messageChanged = true;
      if (screened.stats.quarantined > 0) {
        flaggedTools.push(typeof part.toolName === 'string' ? part.toolName : 'unknown-tool');
      }
      return { ...part, output: screened.output };
    });
    if (!messageChanged) return message;
    changed = true;
    return { ...message, content: parts } as ModelPromptMessage;
  });

  return {
    prompt: changed ? (messages as ModelPrompt) : prompt,
    changed,
    toolResults,
    untrustedToolResults,
    stringsScanned,
    stringsQuarantined,
    stringsWrapped,
    oversizeUntouched,
    unscannedNodes,
    flaggedTools,
  };
}

/** Withhold every tool result in a prompt (strict fail-closed fallback). */
export function withholdPromptToolResults(prompt: ModelPrompt): ModelPrompt {
  // Defensive: this runs on the failure path, so it must never throw. A value
  // that is not a prompt array carries no tool results to withhold.
  if (!Array.isArray(prompt)) return prompt;
  return prompt.map((message) => {
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) return message;
    let messageChanged = false;
    const parts = content.map((part: unknown) => {
      if (!isToolResultPart(part) || !part.output) return part;
      messageChanged = true;
      return { ...part, output: { type: 'text', value: EXTERNAL_QUARANTINE_NOTICE } };
    });
    return messageChanged ? ({ ...message, content: parts } as ModelPromptMessage) : message;
  });
}

export interface IndirectContentGuardrailOptions {
  /**
   * Screening posture recorded on the run report. Both postures screen and
   * quarantine identically here; `strict` additionally withholds all tool
   * results if the screen itself fails, instead of passing them through.
   */
  mode: GuardrailMode;
}

export interface IndirectContentGuardrailProcessor {
  readonly id: string;
  readonly name: string;
  /** Screening events emitted so far (also published to the run context). */
  getEvents(): readonly ContentScreenEvent[];
  processLLMRequest(args: ProcessLLMRequestArgs): Promise<ProcessLLMRequestResult>;
}

/**
 * Build the provider-boundary indirect-content processor.
 *
 * It implements `processLLMRequest`, which runs after the message list has been
 * converted to the model prompt and before the provider call: mutations affect
 * only what the model receives, so persisted messages and the UI keep the
 * original tool output while the model sees the screened copy.
 */
export function createIndirectContentGuardrailProcessor(
  options: IndirectContentGuardrailOptions,
): IndirectContentGuardrailProcessor {
  const events: ContentScreenEvent[] = [];

  const record = (
    event: Omit<ContentScreenEvent, 'path' | 'mode'>,
    sink: ContentScreenReportSink | null | undefined,
  ): void => {
    const complete: ContentScreenEvent = {
      ...event,
      path: 'prompt-tool-result',
      mode: options.mode,
    };
    events.push(complete);
    appendContentScreenEvents(sink, [complete]);
    if (complete.quarantined > 0) {
      metrics.increment('guardrail_indirect_quarantine_total', {
        tags: { path: complete.path, mode: options.mode, source: 'prompt-tool-result' },
      });
    }
    if (complete.unscreened > 0) {
      metrics.increment('guardrail_indirect_unscreened_total', {
        tags: { path: complete.path, mode: options.mode, source: 'prompt-tool-result' },
      });
    }
  };

  return {
    id: INDIRECT_CONTENT_PROCESSOR_ID,
    name: 'Kestrel Indirect Content Guardrail',
    getEvents: () => [...events],
    async processLLMRequest(args: ProcessLLMRequestArgs) {
      const sink = asContentScreenReportSink(args.requestContext);
      let result: PromptToolScreenResult;
      try {
        result = screenPromptToolResults(args.prompt);
      } catch (error) {
        // The screen failing must never be silent, and on a strict path it
        // must never pass unverified tool output to the model.
        metrics.increment('guardrail_indirect_screen_failed_total', {
          tags: { mode: options.mode },
        });
        glog.warn('Indirect content screen failed', {
          mode: options.mode,
          error: error instanceof Error ? error.message : String(error),
        });
        if (options.mode !== 'strict') return undefined;
        record(
          {
            screened: 0,
            quarantined: 0,
            withheld: 0,
            unscreened: 0,
            detectorUnavailable: false,
            failedClosed: true,
            refs: ['screen-failed'],
          },
          sink,
        );
        return { prompt: withholdPromptToolResults(args.prompt) };
      }

      if (!result.changed) {
        // Nothing was rewritten. That is only quiet when there is nothing to
        // disclose: content left uninspected (oversize strings, traversal
        // budget) is still reported.
        if (result.oversizeUntouched === 0 && result.unscannedNodes === 0) return undefined;
        record(
          {
            screened: result.stringsScanned,
            quarantined: 0,
            withheld: 0,
            unscreened: result.oversizeUntouched + result.unscannedNodes,
            detectorUnavailable: false,
            failedClosed: false,
            refs: ['partial-coverage'],
          },
          sink,
        );
        return undefined;
      }

      record(
        {
          screened: result.stringsScanned,
          quarantined: result.stringsQuarantined,
          withheld: 0,
          unscreened: result.oversizeUntouched + result.unscannedNodes,
          detectorUnavailable: false,
          failedClosed: false,
          refs: result.flaggedTools.map((name) => hashLogValue(name)),
        },
        sink,
      );
      if (result.stringsQuarantined > 0) {
        metrics.observe('guardrail_indirect_quarantined_strings', result.stringsQuarantined, {
          tags: { mode: options.mode },
        });
        glog.warn('Instruction-like tool output quarantined before the model call', {
          mode: options.mode,
          toolResults: result.toolResults,
          untrustedToolResults: result.untrustedToolResults,
          stringsScanned: result.stringsScanned,
          stringsQuarantined: result.stringsQuarantined,
          stringsWrapped: result.stringsWrapped,
          oversizeUntouched: result.oversizeUntouched,
          unscannedNodes: result.unscannedNodes,
          tools: result.flaggedTools,
        });
      }
      return { prompt: result.prompt };
    },
  };
}

/**
 * Built guardrail bundle for one agent: the ordered input processors, any
 * degradation warnings, the effective posture, and the indirect-content screen
 * (whose `getEvents()` exposes what was quarantined for the run).
 */
export interface GuardrailBundle {
  processors: InputProcessor[];
  warnings: string[];
  mode: GuardrailMode;
  indirect: IndirectContentGuardrailProcessor;
}

/**
 * Convenience — build conversation-path guardrails (rewrite strategy,
 * availability mode — degrades gracefully without the detector).
 */
export function buildConversationGuardrails(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): GuardrailBundle {
  return buildGuardrailInputProcessors({
    settings,
    env,
    strategy: 'rewrite',
    mode: 'availability',
  });
}

/**
 * Convenience — build research-path guardrails (block strategy).
 *
 * Audit plan §1.2: the mode now comes from the capability manifest, not from
 * `NODE_ENV`. Every research capability carries `contentTrust: 'untrusted'`
 * (news/calendar/social packets include untrusted external content), so
 * research guardrails default to `strict` in every environment. Callers that
 * must degrade (hermetic tests, explicit availability policy) pass
 * `mode: 'availability'` or use `buildResearchGuardrailsAvailability`.
 */
export function buildResearchGuardrails(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  mode: GuardrailMode = 'strict',
): GuardrailBundle {
  return buildGuardrailInputProcessors({
    settings,
    env,
    strategy: 'block',
    mode,
  });
}

/**
 * Convenience — build research-path guardrails in availability mode
 * (for callers that handle degradation themselves).
 */
export function buildResearchGuardrailsAvailability(
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): GuardrailBundle {
  return buildGuardrailInputProcessors({ settings, env, strategy: 'block', mode: 'availability' });
}
