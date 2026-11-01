/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * External content is data, never executable instructions.
 *
 * Public entry point for the external-content boundary. The implementation is
 * split into cohesive leaves and re-exported here, so every existing importer
 * keeps one import path:
 *
 *   - `./external-text-sanitizer` — the deterministic text floor: sanitize,
 *     detect instruction-like phrases, quarantine, delimiter-wrap.
 *   - `./external-content-screen` — the windowed/JSON screens over values and
 *     payload trust declarations.
 *   - `./content-screen-report` — the run-report event vocabulary and sink.
 *   - this module — the typed evidence conversion that synthesis consumes.
 */
import { UntrustedExternalEvidenceSchema, type UntrustedExternalEvidence } from './evidence-types';
import {
  EXTERNAL_CONTENT_TRUST_WARNING,
  MAX_EXTERNAL_CONTENT_LENGTH,
  quarantineExternalText,
  sanitizeExternalText,
  sanitizeExternalUrl,
} from './external-text-sanitizer';

export {
  containsExternalInstructions,
  EXTERNAL_CONTENT_TRUST_WARNING,
  EXTERNAL_QUARANTINE_NOTICE,
  MAX_EXTERNAL_CONTENT_LENGTH,
  quarantineExternalText,
  sanitizeExternalText,
  sanitizeExternalUrl,
  wrapExternalContent,
  type QuarantinedTextResult,
} from './external-text-sanitizer';

export {
  declaresUntrustedContent,
  MIN_SCREENABLE_EXTERNAL_TEXT,
  screenExternalText,
  screenTextValues,
  type ScreenExternalTextOptions,
  type ScreenTextValuesResult,
  type ScreenedExternalText,
} from './external-content-screen';

export {
  appendContentScreenEvents,
  asContentScreenReportSink,
  CONTENT_SCREEN_REPORT_KEY,
  readContentScreenEvents,
  type ContentScreenEvent,
  type ContentScreenMode,
  type ContentScreenPath,
  type ContentScreenReportSink,
} from './content-screen-report';

/**
 * Convert provider text into an explicit evidence object. Callers must opt in
 * to this conversion before placing external content in synthesis context.
 */
export function toUntrustedExternalEvidence(input: {
  evidenceId: string;
  source: string;
  fetchedAt: string;
  dataAsOf: string;
  freshness: 'fresh' | 'stale' | 'unknown';
  quality: 'complete' | 'partial' | 'degraded';
  warnings?: readonly string[];
  content: unknown;
  url?: string;
  publisher?: string;
  provider?: string;
}): UntrustedExternalEvidence {
  const sanitized = quarantineExternalText(input.content, MAX_EXTERNAL_CONTENT_LENGTH);
  return UntrustedExternalEvidenceSchema.parse({
    evidenceId: input.evidenceId,
    trust: 'untrusted-external',
    source: input.source,
    fetchedAt: input.fetchedAt,
    dataAsOf: input.dataAsOf,
    freshness: input.freshness,
    quality: input.quality,
    warnings: [
      ...(input.warnings ?? []),
      EXTERNAL_CONTENT_TRUST_WARNING,
      ...(sanitized.quarantined ? ['Instruction-like external content was quarantined.'] : []),
    ],
    provenance: {
      ...(input.url ? { url: sanitizeExternalUrl(input.url) ?? undefined } : {}),
      ...(input.publisher ? { publisher: sanitizeExternalText(input.publisher, 240) } : {}),
      ...(input.provider ? { provider: sanitizeExternalText(input.provider, 240) } : {}),
    },
    content: sanitized.text,
    containsInstructionLikeText: sanitized.quarantined,
  });
}
