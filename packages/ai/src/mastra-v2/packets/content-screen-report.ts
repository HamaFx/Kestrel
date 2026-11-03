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

// Audit R15 — run-report bookkeeping for indirect content screening.
//
// Every screening path (user turn, provider-boundary tool results, RAG
// retrieval, web search, memory recall) appends a `ContentScreenEvent` to the
// run's context. This leaf holds the vocabulary and the sink plumbing only: it
// imports nothing, so any screening module can depend on it without a cycle.
//
// Re-exported from `./external-content`, which is the public entry point for
// the external-content boundary.

/**
 * Screening posture for content that reaches the model indirectly (tool results,
 * retrieved snippets, recalled memory).
 *
 * - `strict`: refuse unscreened content. When the model-backed detector is
 *   unconfigured or unreachable the content is withheld, never passed through.
 * - `availability`: keep serving, but only after the deterministic screen, and
 *   record the degradation so it is visible in the run report.
 *
 * The posture is a per-path decision (research/untrusted = `strict`,
 * conversation = `availability`) and is never defaulted at the call site.
 */
export type ContentScreenMode = 'strict' | 'availability';

/** Paths that can screen indirect content, used to tag run-report events. */
export type ContentScreenPath =
  | 'user-turn'
  | 'prompt-tool-result'
  | 'rag'
  | 'web-search'
  | 'memory';

/**
 * One content-screening event for the run report. Never carries raw payload
 * text: `refs` holds bounded identifiers (tool names, hashed values) only.
 */
export interface ContentScreenEvent {
  path: ContentScreenPath;
  mode: ContentScreenMode;
  /** Items (snippets, tool results, strings) inspected. */
  screened: number;
  /** Items withheld from the model as instruction-like. */
  quarantined: number;
  /** Items withheld from the model for any other reason (batch cap, strict refusal, oversize). */
  withheld: number;
  /** Items passed with the deterministic screen only, without the model screen. */
  unscreened: number;
  /** True when the model-backed detector was unconfigured or unreachable. */
  detectorUnavailable: boolean;
  /** True when the strict posture refused to pass unscreened content through. */
  failedClosed: boolean;
  refs?: readonly string[];
}

/** Minimal sink shape accepted for run-report publication (`RequestContext`). */
export interface ContentScreenReportSink {
  getRaw(key: string): unknown;
  setRaw(key: string, value: unknown): void;
}

/**
 * Narrow any per-run context (Mastra `RequestContext`, tool context) to a
 * report sink. Returns null when the value cannot store run metadata, so
 * callers never need an unchecked cast.
 */
export function asContentScreenReportSink(value: unknown): ContentScreenReportSink | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ContentScreenReportSink>;
  return typeof candidate.getRaw === 'function' && typeof candidate.setRaw === 'function'
    ? (candidate as ContentScreenReportSink)
    : null;
}

/** RequestContext key under which the run's screening events are published. */
const CONTENT_SCREEN_REPORT_KEY = 'kestrelContentScreenReport';

/** Append screening events to the run context so the report is never silent. */
export function appendContentScreenEvents(
  sink: ContentScreenReportSink | null | undefined,
  events: readonly ContentScreenEvent[],
): void {
  if (!sink || events.length === 0) return;
  let existing: ContentScreenEvent[] = [];
  const previous = sink.getRaw(CONTENT_SCREEN_REPORT_KEY);
  if (Array.isArray(previous)) {
    existing = previous.filter(
      (item): item is ContentScreenEvent => typeof item === 'object' && item !== null,
    );
  }
  sink.setRaw(CONTENT_SCREEN_REPORT_KEY, [...existing, ...events]);
}

/** Read the run's screening events (empty when nothing was screened). */
export function readContentScreenEvents(
  sink: ContentScreenReportSink | null | undefined,
): readonly ContentScreenEvent[] {
  if (!sink) return [];
  const value = sink.getRaw(CONTENT_SCREEN_REPORT_KEY);
  return Array.isArray(value)
    ? value.filter((item): item is ContentScreenEvent => typeof item === 'object' && item !== null)
    : [];
}
