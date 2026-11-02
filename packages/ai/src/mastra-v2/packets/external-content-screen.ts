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

// Audit R15 — windowed screening of indirect content values.
//
// `screenExternalText` checks a whole string (in overlapping windows, so a
// directive past char 4000 is still caught), `screenTextValues` walks a
// JSON-shaped tool payload without disturbing its structure, and
// `declaresUntrustedContent` reads the payload's own trust declaration.
// Instruction-like text is replaced by `EXTERNAL_QUARANTINE_NOTICE`; declared
// untrusted payloads additionally get the sanitizer and the untrusted-data
// delimiters.
//
// Re-exported from `./external-content`, which is the public entry point.

import {
  containsExternalInstructions,
  EXTERNAL_QUARANTINE_NOTICE,
  MAX_EXTERNAL_CONTENT_LENGTH,
  quarantineExternalText,
  wrapExternalContent,
} from './external-text-sanitizer';

/** Shortest string treated as prose worth screening (ids, labels, codes are skipped). */
const MIN_SCREENABLE_EXTERNAL_TEXT = 16;

export interface ScreenExternalTextOptions {
  /**
   * Treat the value as declared-untrusted external data: sanitize it, and wrap
   * the survivors in the `[UNTRUSTED EXTERNAL DATA]` delimiters. When false
   * (default) the value is only checked and returned byte-identical when clean,
   * so trusted tool output is never rewritten.
   */
  untrusted?: boolean;
  /** Upper bound applied to sanitized text. Default `MAX_EXTERNAL_CONTENT_LENGTH`. */
  maxLength?: number;
  /** Shortest string worth screening. Default `MIN_SCREENABLE_EXTERNAL_TEXT`. */
  minLength?: number;
}

/** Longest window the sanitizer/instruction check reads in one pass. */
const INSTRUCTION_SCAN_WINDOW = 4_000;
/** Overlap between windows so a directive spanning a boundary still matches. */
const INSTRUCTION_SCAN_OVERLAP = 80;

/**
 * Instruction check that covers the whole string, not just the first window.
 * A long tool payload is the obvious place to hide a directive past char 4000.
 */
function containsInstructionsAnywhere(text: string): boolean {
  if (text.length <= INSTRUCTION_SCAN_WINDOW) return containsExternalInstructions(text);
  for (
    let start = 0;
    start < text.length;
    start += INSTRUCTION_SCAN_WINDOW - INSTRUCTION_SCAN_OVERLAP
  ) {
    if (containsExternalInstructions(text.slice(start, start + INSTRUCTION_SCAN_WINDOW))) {
      return true;
    }
  }
  return false;
}

export interface ScreenedExternalText {
  text: string;
  quarantined: boolean;
  /** True when the returned text is wrapped in the untrusted-data delimiters. */
  wrapped: boolean;
}

/**
 * Screen one string value before it reaches the model.
 *
 * Instruction-like text is replaced by `EXTERNAL_QUARANTINE_NOTICE` in every
 * mode. Declared-untrusted content additionally gets the sanitizer plus the
 * untrusted-data delimiters, which is what `wrapExternalContent` exists for.
 */
export function screenExternalText(
  value: unknown,
  options: ScreenExternalTextOptions = {},
): ScreenedExternalText {
  const minLength = options.minLength ?? MIN_SCREENABLE_EXTERNAL_TEXT;
  if (typeof value !== 'string') return { text: '', quarantined: false, wrapped: false };
  if (value.length < minLength) return { text: value, quarantined: false, wrapped: false };

  const maxLength = options.maxLength ?? MAX_EXTERNAL_CONTENT_LENGTH;
  if (containsInstructionsAnywhere(value)) {
    return { text: EXTERNAL_QUARANTINE_NOTICE, quarantined: true, wrapped: false };
  }
  if (options.untrusted) {
    const sanitized = quarantineExternalText(value, maxLength);
    if (sanitized.quarantined) {
      return { text: sanitized.text, quarantined: true, wrapped: false };
    }
    return {
      text: wrapExternalContent(sanitized.text, maxLength),
      quarantined: false,
      wrapped: true,
    };
  }
  return { text: value, quarantined: false, wrapped: false };
}

export interface ScreenTextValuesResult {
  value: unknown;
  /** Strings inspected with the instruction screen. */
  scanned: number;
  /** Strings replaced by `EXTERNAL_QUARANTINE_NOTICE`. */
  quarantined: number;
  /** Strings wrapped in the untrusted-data delimiters. */
  wrapped: number;
  /** Strings longer than `maxLength`: checked, but left byte-identical when clean. */
  oversizeUntouched: number;
  /**
   * Container nodes not descended into because the traversal budget ran out.
   * Non-zero means part of the payload was never inspected, and the caller
   * must treat that as unscreened content rather than as clean.
   */
  unscannedNodes: number;
}

/**
 * Screen every string inside a JSON-shaped value (tool result payloads,
 * retrieved rows) without disturbing numbers, booleans, or structure. Arrays
 * and objects are only rebuilt when a child changed.
 */
export function screenTextValues(
  value: unknown,
  options: ScreenExternalTextOptions & { budget?: number } = {},
): ScreenTextValuesResult {
  const budget = options.budget ?? 5_000;
  const maxLength = options.maxLength ?? MAX_EXTERNAL_CONTENT_LENGTH;
  const minLength = options.minLength ?? MIN_SCREENABLE_EXTERNAL_TEXT;
  let scanned = 0;
  let quarantined = 0;
  let wrapped = 0;
  let oversizeUntouched = 0;
  let unscannedNodes = 0;
  let visited = 0;

  const walk = (node: unknown): unknown => {
    if (visited > budget) {
      unscannedNodes += 1;
      return node;
    }
    if (typeof node === 'string') {
      visited += 1;
      const oversize = node.length > maxLength;
      // Oversize strings are fully checked (in windows) but only rewritten
      // when flagged, so provider text is never silently cut.
      const result = screenExternalText(node, {
        ...options,
        maxLength: Math.min(node.length, maxLength),
        minLength,
      });
      scanned += 1;
      if (result.quarantined) quarantined += 1;
      if (result.wrapped) wrapped += 1;
      if (oversize && !result.quarantined) {
        oversizeUntouched += 1;
        return node;
      }
      return result.text;
    }
    if (Array.isArray(node)) {
      visited += 1;
      let changed = false;
      const mapped = node.map((child) => {
        const next = walk(child);
        if (next !== child) changed = true;
        return next;
      });
      return changed ? mapped : node;
    }
    if (node !== null && typeof node === 'object') {
      visited += 1;
      let changed = false;
      const mapped: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        const next = walk(child);
        if (next !== child) changed = true;
        mapped[key] = next;
      }
      return changed ? mapped : node;
    }
    return node;
  };

  return { value: walk(value), scanned, quarantined, wrapped, oversizeUntouched, unscannedNodes };
}

/** Nodes visited while probing a payload for a trust declaration. */
const TRUST_DECLARATION_BUDGET = 2_000;

/**
 * True when a tool payload declares that it carries untrusted external content
 * (`contentTrust: 'untrusted' | 'mixed-untrusted'`). Payloads that make the
 * claim get the sanitizer and the untrusted-data delimiters; payloads that do
 * not are still screened for instruction-like strings.
 */
export function declaresUntrustedContent(value: unknown): boolean {
  let visited = 0;
  const check = (node: unknown): boolean => {
    if (visited > TRUST_DECLARATION_BUDGET) return false;
    if (Array.isArray(node)) {
      visited += 1;
      return node.some(check);
    }
    if (node === null || typeof node !== 'object') return false;
    visited += 1;
    const record = node as Record<string, unknown>;
    const declared = record.contentTrust;
    if (typeof declared === 'string') {
      const normalized = declared.toLowerCase();
      if (normalized === 'untrusted' || normalized === 'mixed-untrusted') return true;
    }
    return Object.values(record).some(check);
  };
  return check(value);
}
