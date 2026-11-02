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
 * Freshness gating for numeric evidence (audit 2026-10-31, R8).
 *
 * `get_price` and `get_candles` attach a freshness envelope (`stale`,
 * `ageSeconds`, `producedAt`) plus pre-rendered disclosure warnings to their
 * output. This module reads that envelope so the canonical evidence gate and
 * the committee grounding path can refuse to ground a number in data the
 * emitter itself disclosed as stale, or as older than the live window the
 * emitter documents. Tools without an envelope are untouched: the gate only
 * applies where the emitter discloses.
 *
 * This is a leaf module on purpose. `committee/grounding.ts` imports it while
 * `agents/canonical/evidence.ts` imports `committee/grounding.ts`, so it must
 * never import either of them back.
 */

import { extractNarrativeNumbers } from '../../shared/report-grounding';

/** Label used when an envelope names neither a symbol nor a tool. */
const DEFAULT_LABEL = 'market data';

/** Same recursion bound the committee number extractor always had. */
const MAX_WALK_DEPTH = 6;

/**
 * Keys whose numbers are metadata, not market readings: bar/observation
 * timestamps, the envelope itself, and the pre-rendered warnings. They never
 * count as evidence in either direction.
 */
const SKIPPED_KEYS = new Set(['t', 'ts', 'fetchedAt', 'producedAt', 'freshness', 'warnings']);

/**
 * Age past which the emitting tool itself declares the value not live.
 * `get_price` documents `PRICE_AGE_WARN_SECONDS = 60` and emits the matching
 * "disclose that it is not live" warning line, so mirroring it here keeps the
 * gate honest even when the warning line is absent from a replayed output.
 * Tools without an entry are gated on their explicit `stale` flag alone.
 */
const EMITTER_AGE_LIMIT_SECONDS: Readonly<Record<string, number>> = {
  get_price: 60,
};

/** The emitter's own warning lines that declare a datum stale or not live. */
const NOT_LIVE_WARNING_PATTERN = /\b(?:stale|not live)\b/i;

/** Why an envelope entry counts as stale. */
export type FreshnessStaleReason = 'flagged' | 'aged' | null;

export interface FreshnessEntry {
  /** Datum label: `XAUUSD`, `XAUUSD 1h`, or the tool name when unnamed. */
  label: string;
  /** Envelope symbol when the emitter reports per-symbol freshness. */
  symbol?: string;
  /** True when the emitter flagged a stale cache, or the age passed its live window. */
  stale: boolean;
  /** `flagged` = fallback cache; `aged` = older than the emitter's live window. */
  staleReason: FreshnessStaleReason;
  /** Seconds since the upstream observed the value; null when the envelope does not say. */
  ageSeconds: number | null;
  /** Provider that produced the value, when the envelope carries one. */
  source?: string;
}

/** A numeric value whose only freshness envelope says it is stale. */
export interface StaleNumber {
  value: number;
  entry: FreshnessEntry;
}

export interface FreshnessNumberPartition {
  /** True when at least one freshness envelope was found in the output. */
  gated: boolean;
  /** Values from fresh (or ungated) sources. */
  fresh: number[];
  /** Values that appear only under a stale envelope, with the reason. */
  stale: StaleNumber[];
}

interface NumberScope {
  stale: boolean;
  entry: FreshnessEntry | null;
  /** Per-symbol envelope entries; object values carrying `symbol` use theirs. */
  bySymbol: ReadonlyMap<string, FreshnessEntry> | null;
}

export interface FreshnessPartitionOptions {
  /** Tool id, when known; unlocks the tool's documented age limit. */
  toolName?: string;
  /** Recursion bound; defaults to the committee extractor's historical 6. */
  maxDepth?: number;
}

/**
 * Read the freshness envelope attached to a structured tool output, or null
 * when the output carries none. An envelope is a `freshness` object or array
 * of objects with a boolean `stale`; a packet's `freshness: 'fresh'` string is
 * not one and is ignored.
 */
export function readFreshnessEnvelope(value: unknown, toolName?: string): FreshnessEntry[] | null {
  const node = findEnvelopeNode(value, MAX_WALK_DEPTH);
  if (node === null) return null;

  const raw = (node as { freshness?: unknown }).freshness;
  const rawEntries = Array.isArray(raw) ? raw : [raw];
  const warnings = warningStrings(node);
  const { label: nodeLabel, specific: nodeLabelIsSpecific } = envelopeNodeLabel(node, toolName);
  const ageLimit = toolName === undefined ? undefined : EMITTER_AGE_LIMIT_SECONDS[toolName];
  const entries: FreshnessEntry[] = [];

  for (const item of rawEntries) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const symbol = typeof record.symbol === 'string' ? record.symbol : undefined;
    const label = symbol ?? nodeLabel;
    const ageSeconds = finiteNumber(record.ageSeconds);
    const source = typeof record.source === 'string' ? record.source : undefined;
    const flagged = record.stale === true;
    const aged = !flagged && ageSeconds !== null && ageLimit !== undefined && ageSeconds > ageLimit;
    // The emitter's own disclosure line is the other way a datum declares
    // itself not live (the price tool's age warning is emitted this way).
    const warned =
      !flagged &&
      !aged &&
      warningDeclaresNotLive(warnings, label, symbol !== undefined || nodeLabelIsSpecific);
    const stale = flagged || aged || warned;
    entries.push({
      label,
      ...(symbol === undefined ? {} : { symbol }),
      stale,
      staleReason: stale ? (aged ? 'aged' : 'flagged') : null,
      ageSeconds,
      ...(source === undefined ? {} : { source }),
    });
  }
  return entries;
}

/**
 * Partition an output's numeric values into fresh and stale by its freshness
 * envelope. Values under a stale scope are reported with the envelope entry
 * that condemns them; everything else is fresh, exactly as before R8.
 */
export function partitionNumbersByFreshness(
  value: unknown,
  options: FreshnessPartitionOptions = {},
): FreshnessNumberPartition {
  const out: FreshnessNumberPartition = { gated: false, fresh: [], stale: [] };
  const fallbackLabel = options.toolName ?? DEFAULT_LABEL;
  walkNumbers(
    value,
    options.maxDepth ?? MAX_WALK_DEPTH,
    { stale: false, entry: null, bySymbol: null },
    options.toolName,
    fallbackLabel,
    out,
  );
  return out;
}

function walkNumbers(
  node: unknown,
  depth: number,
  scope: NumberScope,
  toolName: string | undefined,
  fallbackLabel: string,
  out: FreshnessNumberPartition,
): void {
  if (depth <= 0 || node === null || node === undefined) return;
  if (typeof node === 'number') {
    if (Number.isFinite(node)) pushNumber(node, scope, fallbackLabel, out);
    return;
  }
  if (typeof node === 'string') {
    for (const value of extractNarrativeNumbers(node)) {
      pushNumber(value, scope, fallbackLabel, out);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walkNumbers(item, depth - 1, scope, toolName, fallbackLabel, out);
    }
    return;
  }
  if (typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  let ownScope = scope;
  if (typeof record.symbol === 'string') {
    const symbolEntry = scope.bySymbol?.get(record.symbol);
    if (symbolEntry !== undefined) {
      ownScope = { stale: symbolEntry.stale, entry: symbolEntry, bySymbol: null };
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, 'freshness')) {
    const envelope = readFreshnessEnvelope(record, toolName);
    if (envelope !== null && envelope.length > 0) {
      out.gated = true;
      const allStale = envelope.every((entry) => entry.stale);
      const bySymbol = new Map<string, FreshnessEntry>();
      for (const entry of envelope) {
        if (entry.symbol !== undefined) bySymbol.set(entry.symbol, entry);
      }
      ownScope = {
        stale: allStale,
        entry: envelope.length === 1 ? envelope[0]! : allStale ? envelope[0]! : null,
        bySymbol: bySymbol.size > 0 ? bySymbol : null,
      };
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (SKIPPED_KEYS.has(key)) continue;
    walkNumbers(child, depth - 1, ownScope, toolName, fallbackLabel, out);
  }
}

function pushNumber(
  value: number,
  scope: NumberScope,
  fallbackLabel: string,
  out: FreshnessNumberPartition,
): void {
  if (!scope.stale) {
    out.fresh.push(value);
    return;
  }
  out.stale.push({
    value,
    entry: scope.entry ?? {
      label: fallbackLabel,
      stale: true,
      staleReason: 'flagged',
      ageSeconds: null,
    },
  });
}

function findEnvelopeNode(value: unknown, depth: number): Record<string, unknown> | null {
  if (depth <= 0 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEnvelopeNode(item, depth - 1);
      if (found !== null) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, 'freshness')) {
    const raw = record.freshness;
    const usable = Array.isArray(raw)
      ? raw.some((item) => item !== null && typeof item === 'object')
      : raw !== null && typeof raw === 'object';
    if (usable) return record;
  }
  for (const child of Object.values(record)) {
    const found = findEnvelopeNode(child, depth - 1);
    if (found !== null) return found;
  }
  return null;
}

function envelopeNodeLabel(
  node: Record<string, unknown>,
  toolName?: string,
): { label: string; specific: boolean } {
  const symbol = typeof node.symbol === 'string' ? node.symbol : null;
  const tf = typeof node.tf === 'string' ? node.tf : null;
  if (symbol !== null && tf !== null) return { label: `${symbol} ${tf}`, specific: true };
  if (symbol !== null) return { label: symbol, specific: true };
  return { label: toolName ?? DEFAULT_LABEL, specific: false };
}

function warningStrings(node: Record<string, unknown>): string[] {
  const warnings = node.warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.filter((warning): warning is string => typeof warning === 'string');
}

function warningDeclaresNotLive(
  warnings: readonly string[],
  label: string,
  labelIsSpecific: boolean,
): boolean {
  const matches = (warning: string) => NOT_LIVE_WARNING_PATTERN.test(warning);
  if (!labelIsSpecific) return warnings.some(matches);
  return warnings.some((warning) => matches(warning) && warning.startsWith(`${label}:`));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
