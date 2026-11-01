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
 * Audit R15 — provider-boundary indirect-content guardrail processor.
 *
 * Implements `processLLMRequest`, which runs after the message list has been
 * converted to the model prompt and before the provider call. That is the last
 * hop where tool output, news, web-search results, retrieved knowledge and
 * recalled memory can be inspected before the model reads them, and it runs on
 * every step of a tool loop.
 *
 * Mutations affect only what the model receives, so persisted messages and the
 * UI keep the original tool output while the model sees the screened copy.
 * Every outcome (quarantine, partial coverage, screen failure) is published to
 * the run's content-screen report and to metrics; nothing degrades silently,
 * and on a `strict` path a screen failure withholds the tool results instead of
 * passing them through.
 *
 * Attached through `buildGuardrailInputProcessors` in `./guardrails`, which is
 * also where this module is re-exported from.
 */

import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import type { ProcessLLMRequestArgs, ProcessLLMRequestResult } from '@mastra/core/processors';

import { hashLogValue } from '../diagnostics/redact';
import {
  screenPromptToolResults,
  withholdPromptToolResults,
  type PromptToolScreenResult,
} from './indirect-content-screen';
import {
  appendContentScreenEvents,
  asContentScreenReportSink,
  type ContentScreenEvent,
  type ContentScreenMode,
  type ContentScreenReportSink,
} from './packets/external-content';

const glog = createCategorizedLogger('ai', { component: 'mastra:guardrails' });

/** Processor id for the deterministic indirect-content screen. */
export const INDIRECT_CONTENT_PROCESSOR_ID = 'kestrel-indirect-content-guardrail';

export interface IndirectContentGuardrailOptions {
  /**
   * Screening posture recorded on the run report. Both postures screen and
   * quarantine identically here; `strict` additionally withholds all tool
   * results if the screen itself fails, instead of passing them through.
   */
  mode: ContentScreenMode;
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
