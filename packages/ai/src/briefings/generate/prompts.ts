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

// Briefing prompt assembly and deterministic summaries (DEC-05 split from
// generate.ts). LLM-authored bodies are built here; the deterministic
// fallbacks are the stats-only equivalent used when budget or settings do
// not allow a generation.

import type { EconomicEvent } from '@kestrel/shared';

import type { computeStats } from '../../journal/persistence';
import { sanitizeExternalText } from '../../mastra-v2/packets/external-content';

/** Exported for testing — builds the LLM prompt for an event briefing. */
export function buildEventPrompt(event: EconomicEvent, kind: 'pre' | 'post'): string {
  const iso = new Date(event.date).toISOString();
  const lines = [
    `Event: ${sanitizeExternalText(event.title, 200)}`,
    `Country: ${event.country}; Currency: ${event.currency ?? 'n/a'}`,
    `Importance: ${event.importance}`,
    `Scheduled: ${iso}`,
    `Forecast: ${event.forecast ?? 'n/a'}`,
    `Previous: ${event.previous ?? 'n/a'}`,
  ];
  if (kind === 'post' && event.actual !== null) {
    lines.push(`Actual: ${event.actual}`);
  }
  lines.push('', 'Task:');
  if (kind === 'pre') {
    lines.push(
      'Write a pre-event briefing that names the event, the time in UTC, key levels to watch, and the typical reaction. Bullets, no fluff.',
    );
  } else {
    lines.push(
      'Write a post-event recap covering the actual vs forecast vs previous, the implied surprise direction, and one trade-management note. Bullets, no fluff.',
    );
  }
  return lines.join('\n');
}

/** Exported for testing — deterministic fallback summary for event briefings. */
export function deterministicEventSummary(event: EconomicEvent, kind: 'pre' | 'post'): string {
  const iso = new Date(event.date).toISOString();
  if (kind === 'pre') {
    return [
      `${event.title} (${event.currency ?? event.country}) — ${iso}`,
      `Importance: ${event.importance}.`,
      `Forecast: ${event.forecast ?? 'n/a'} · Previous: ${event.previous ?? 'n/a'}.`,
      'Watch for the headline number and whisper number; reactions usually peak inside the first 5 minutes.',
    ].join('\n');
  }
  return [
    `${event.title} (${event.currency ?? event.country}) — ${iso}`,
    `Actual: ${event.actual ?? 'n/a'} · Forecast: ${event.forecast ?? 'n/a'} · Previous: ${event.previous ?? 'n/a'}.`,
    surpriseLabel(event),
  ].join('\n');
}

/** Exported for testing — labels the surprise direction of an economic event. */
export function surpriseLabel(event: EconomicEvent): string {
  if (event.actual === null || event.forecast === null) return 'No surprise detectable.';
  const diff = event.actual - event.forecast;
  if (Math.abs(diff) < 1e-9) return 'Print matched forecast.';
  return diff > 0 ? 'Beat (positive surprise).' : 'Miss (negative surprise).';
}

/** Exported for testing — deterministic fallback for the weekly review summary. */
export function deterministicWeeklyReview(stats: Awaited<ReturnType<typeof computeStats>>): string {
  return [
    `Last 7 days — ${stats.count} trade${stats.count === 1 ? '' : 's'} (${stats.wins}W / ${stats.losses}L / ${stats.breakevens}BE / ${stats.open} open).`,
    `Win rate: ${(stats.winRate * 100).toFixed(1)}% · Avg R: ${stats.avgR.toFixed(2)} · Total R: ${stats.totalR.toFixed(2)}.`,
  ].join('\n');
}
