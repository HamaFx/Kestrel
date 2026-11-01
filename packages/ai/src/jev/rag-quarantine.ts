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
 * Phase 2 (Jev System One) — indirect prompt-injection quarantine & RAG
 * reranker (Check Point evidence-poisoning hardening).
 *
 * RAG chunks and web-search snippets are untrusted external data. Screening is
 * two-layered (audit R15):
 *
 *   1. Deterministic (always, every item): `screenSnippetsDeterministically`
 *      drops any snippet whose text carries instruction-like phrases. This does
 *      not depend on any network call.
 *   2. Model-backed (Jev): `runSnippetInjectionBatch` asks one
 *      `/v1/systemone` batch for a relevance score and an injection judgement
 *      per snippet; the injection judgement quarantines, the relevance score
 *      becomes the gate and rerank order.
 *
 * This module is the policy layer that joins them: it enforces the batch cap,
 * applies the relevance gate, and decides what the posture allows.
 *
 * Availability posture (`mode`) is per call site and must be stated:
 *
 *   - `strict` (research/untrusted paths): if the model screen cannot run the
 *     snippets are withheld (`failedClosed: true`) instead of passed through,
 *     and snippets beyond the batch cap are withheld too, so no unscreened
 *     external content reaches the model.
 *   - `availability` (conversation paths): the deterministic floor still
 *     applies, the input order is kept, and the degradation is reported
 *     (`degraded`, `degradedReason`, `unscreenedIds`) rather than hidden.
 *
 * Batch cap: one `/v1/systemone` request carries at most
 * `JEV_RAG_RERANK_MAX_ITEMS` snippets (payload size and the 800 ms budget).
 * Every production caller is bounded well below it (`web_search.maxResults`
 * <= 10, `search_knowledge.limit` <= 10), so the cap never truncates the real
 * candidate set today; a caller that exceeds it can no longer pass the excess
 * through silently (see `unscreenedIds` / `withheldIds`).
 */

import type {
  ContentScreenMode,
  ContentScreenPath,
  ContentScreenReportSink,
} from '../mastra-v2/packets/external-content';
import { hasJevConfiguration } from './resolve-endpoint';
import { runSnippetInjectionBatch } from './snippet-injection-batch';
import {
  reportSnippetScreenDegraded,
  reportSnippetScreenEvent,
  type QuarantineDegradeReason,
} from './snippet-injection-report';
import {
  screenSnippetsDeterministically,
  type QuarantineRerankItem,
} from './snippet-injection-screen';
import type { JevEnv, JevGenerationLedger, JevSettings } from './types';

/** Maximum snippets scored in one model batch. */
export const JEV_RAG_RERANK_MAX_ITEMS = 12;

/** Default `rel_${i}` score below which a snippet is not worth prompt tokens. */
export const JEV_RAG_MIN_RELEVANCE_DEFAULT = 0.3;

export type { QuarantineDegradeReason, QuarantineRerankItem };

export {
  JEV_RAG_INJECTION_QUARANTINE_MIN,
  JEV_RAG_QUERY_CHARS,
  JEV_RAG_RERANK_TIMEOUT_MS,
  JEV_RAG_SNIPPET_CHARS,
} from './snippet-injection-batch';

export interface QuarantineRerankArgs<T extends QuarantineRerankItem> {
  query: string;
  items: readonly T[];
  /**
   * Screening posture (required — never defaulted, so a caller cannot
   * silently fail open). See the module doc for what each mode does.
   */
  mode: ContentScreenMode;
  /** Keep snippets with a relevance score >= this (default 0.3). */
  minRelevanceScore?: number | undefined;
  settings?: JevSettings | null | undefined;
  env?: JevEnv | null | undefined;
  signal?: AbortSignal | null | undefined;
  fetchImpl?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
  ledger?: JevGenerationLedger | null | undefined;
  ledgerEntryId?: string | undefined;
  /** Run context that receives the screening event. */
  reportSink?: ContentScreenReportSink | null | undefined;
  /** Run-report path tag. Defaults to `rag`. */
  reportPath?: ContentScreenPath | undefined;
}

export interface QuarantineRerankResult<T extends QuarantineRerankItem> {
  /** Snippets cleared for the context window, in caller-readable order. */
  kept: T[];
  /** Ids of snippets that contained embedded instructions (never returned). */
  quarantinedIds: string[];
  /**
   * Ids passed with the deterministic screen only, without the model screen
   * (snippets beyond the single-batch cap, or any snippet when the model
   * screen was unavailable in `availability` mode).
   */
  unscreenedIds: string[];
  /** Ids withheld entirely because the strict posture could not screen them. */
  withheldIds: string[];
  /** True when the model screen did not run (unconfigured or unreachable). */
  degraded: boolean;
  /** Why the model screen did not run; null when it did. */
  degradedReason: QuarantineDegradeReason | null;
  /** True when the strict posture refused to pass unscreened content through. */
  failedClosed: boolean;
}

/**
 * Quarantine injection-laden snippets, then model-screen and rerank the rest.
 * Never throws: every failure path is reported in the result.
 */
export async function quarantineAndRerankSnippets<T extends QuarantineRerankItem>(
  args: QuarantineRerankArgs<T>,
): Promise<QuarantineRerankResult<T>> {
  const mode = args.mode;
  const sink = args.reportSink ?? null;
  const reportPath = args.reportPath ?? 'rag';
  const items = args.items;
  const empty: QuarantineRerankResult<T> = {
    kept: [],
    quarantinedIds: [],
    unscreenedIds: [],
    withheldIds: [],
    degraded: false,
    degradedReason: null,
    failedClosed: false,
  };
  if (items.length === 0) return empty;

  const minRelevance = args.minRelevanceScore ?? JEV_RAG_MIN_RELEVANCE_DEFAULT;

  // Layer 1 — deterministic screen over EVERY item. Independent of Jev, so a
  // missing detector can never mean an unscreened instruction reaches the
  // model through a snippet that the regex plainly recognizes.
  const { survivors, quarantinedIds } = screenSnippetsDeterministically(items);

  if (survivors.length === 0) {
    reportSnippetScreenEvent(sink, {
      mode,
      path: reportPath,
      screened: items.length,
      quarantined: quarantinedIds.length,
      withheld: quarantinedIds.length,
      unscreened: 0,
      detectorUnavailable: false,
      failedClosed: false,
    });
    return { ...empty, quarantinedIds };
  }

  // Layer 2 — model screen. One batch; the overflow is deterministic-only and
  // reported (see `unscreenedIds` / `withheldIds`).
  const scored = survivors.slice(0, JEV_RAG_RERANK_MAX_ITEMS);
  const overflow = survivors.slice(JEV_RAG_RERANK_MAX_ITEMS);

  const batch = await runSnippetInjectionBatch({
    query: args.query,
    items: scored,
    ...(args.settings !== undefined ? { settings: args.settings } : {}),
    ...(args.env !== undefined ? { env: args.env } : {}),
    ...(args.signal !== undefined ? { signal: args.signal } : {}),
    ...(args.fetchImpl !== undefined ? { fetchImpl: args.fetchImpl } : {}),
    ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
    ...(args.ledger !== undefined ? { ledger: args.ledger } : {}),
    ...(args.ledgerEntryId !== undefined ? { ledgerEntryId: args.ledgerEntryId } : {}),
  });

  if (batch.status === 'unavailable') {
    const reason: QuarantineDegradeReason = hasJevConfiguration(args.settings, args.env)
      ? 'unavailable'
      : 'unconfigured';
    reportSnippetScreenDegraded(mode, reason);
    if (mode === 'strict') {
      // Fail closed: nothing is model-screened, so nothing reaches the model.
      const withheldIds = survivors.map((item) => item.id);
      reportSnippetScreenEvent(sink, {
        mode,
        path: reportPath,
        screened: items.length,
        quarantined: quarantinedIds.length,
        withheld: withheldIds.length,
        unscreened: 0,
        detectorUnavailable: true,
        failedClosed: true,
      });
      return {
        kept: [],
        quarantinedIds,
        unscreenedIds: [],
        withheldIds,
        degraded: true,
        degradedReason: reason,
        failedClosed: true,
      };
    }
    reportSnippetScreenEvent(sink, {
      mode,
      path: reportPath,
      screened: items.length,
      quarantined: quarantinedIds.length,
      withheld: 0,
      unscreened: survivors.length,
      detectorUnavailable: true,
      failedClosed: false,
    });
    return {
      kept: [...survivors],
      quarantinedIds,
      unscreenedIds: survivors.map((item) => item.id),
      withheldIds: [],
      degraded: true,
      degradedReason: reason,
      failedClosed: false,
    };
  }

  quarantinedIds.push(...batch.quarantinedIds);

  let aboveBar = batch.candidates.filter((candidate) => candidate.relevance >= minRelevance);
  if (aboveBar.length === 0 && batch.candidates.length > 0) {
    // Never let the gate turn a non-empty candidate set into zero results:
    // keep the single most relevant non-quarantined snippet.
    aboveBar = [
      batch.candidates.reduce((best, current) =>
        current.relevance > best.relevance ? current : best,
      ),
    ];
  }
  aboveBar.sort((a, b) => b.relevance - a.relevance);

  const overflowIds = overflow.map((item) => item.id);
  const strict = mode === 'strict';
  reportSnippetScreenEvent(sink, {
    mode,
    path: reportPath,
    screened: items.length,
    quarantined: quarantinedIds.length,
    withheld: strict ? overflowIds.length : 0,
    unscreened: strict ? 0 : overflowIds.length,
    detectorUnavailable: false,
    failedClosed: false,
    provider: batch.providerId,
  });

  return {
    kept: strict
      ? aboveBar.map((candidate) => candidate.item)
      : [...aboveBar.map((candidate) => candidate.item), ...overflow],
    quarantinedIds,
    unscreenedIds: strict ? [] : overflowIds,
    withheldIds: strict ? overflowIds : [],
    degraded: false,
    degradedReason: null,
    failedClosed: false,
  };
}
