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

// R13 (audit 2026-10-31): schema, content caps, and normalization for the
// journal coach review. Kept separate from `coach-insights.ts` so the run
// orchestration stays under the file-size limit and the validation surface
// has one obvious home.

import { z } from 'zod';

import { sanitizeExternalText } from '../mastra-v2/packets/external-content';

export const CoachInsightsOutputSchema = z.object({
  disciplineGrade: z.enum(['A+', 'A', 'B', 'C', 'D', 'F']),
  summary: z.string().min(1),
  strengths: z.array(z.string()).max(5),
  leaks: z.array(z.string()).max(5),
  actionRules: z.array(z.string()).max(5),
});

export type CoachInsightsPayload = z.infer<typeof CoachInsightsOutputSchema>;

/**
 * Caps applied to model prose before it can be shown or mirrored into working
 * memory. The schema validates the shape; these bound the content.
 */
const COACH_SUMMARY_MAX_CHARS = 600;
const COACH_BULLET_MAX_CHARS = 240;
const COACH_MAX_BULLETS = 5;

/**
 * A coach review is only built from a schema-valid model response. When the
 * model emits malformed JSON, a non-object payload, or fields that do not
 * match `CoachInsightsOutputSchema`, the review fails with this typed error
 * instead of persisting raw model text; the caller can surface a retry, and
 * working memory keeps the previous profile.
 *
 * `statusCode` 422 maps to a clean API error envelope at the web boundary.
 */
export class CoachInsightsUnavailableError extends Error {
  readonly statusCode = 422;
  readonly code = 'COACH_INSIGHTS_UNAVAILABLE';
  readonly reason = 'invalid_model_output' as const;

  constructor() {
    super(
      'The coach review could not be validated against its expected format, so nothing was saved. Run the review again.',
    );
    this.name = 'CoachInsightsUnavailableError';
  }
}

/**
 * Normalize model output into the coach schema: strings are sanitized and
 * truncated, bullets are capped, the grade is case-normalized. Returns null
 * when the payload cannot be made to fit (the caller must then fail the
 * review, never fall back to raw prose).
 */
function coerceStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const bullets: string[] = [];
  for (const item of value.slice(0, COACH_MAX_BULLETS)) {
    if (typeof item !== 'string') return null;
    const clean = sanitizeExternalText(item, COACH_BULLET_MAX_CHARS);
    if (clean) bullets.push(clean);
  }
  return bullets;
}

function coerceCoachInsights(raw: unknown): CoachInsightsPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  const disciplineGrade =
    typeof candidate.disciplineGrade === 'string'
      ? candidate.disciplineGrade.trim().toUpperCase()
      : '';
  const summary =
    typeof candidate.summary === 'string'
      ? sanitizeExternalText(candidate.summary, COACH_SUMMARY_MAX_CHARS)
      : '';
  const strengths = coerceStringList(candidate.strengths);
  const leaks = coerceStringList(candidate.leaks);
  const actionRules = coerceStringList(candidate.actionRules);
  if (strengths === null || leaks === null || actionRules === null) return null;

  const parsed = CoachInsightsOutputSchema.safeParse({
    disciplineGrade,
    summary,
    strengths,
    leaks,
    actionRules,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Prefer the runner's parsed structured object; fall back to parsing the raw
 * text (the model may wrap valid JSON in a markdown fence). Both paths end in
 * `coerceCoachInsights`, so nothing unvalidated leaves this function.
 */
export function parseCoachPayload(rawText: string, object: unknown): CoachInsightsPayload | null {
  const fromObject = coerceCoachInsights(object);
  if (fromObject) return fromObject;
  if (!rawText) return null;
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed: unknown = JSON.parse(cleaned);
    return coerceCoachInsights(parsed);
  } catch {
    return null;
  }
}
