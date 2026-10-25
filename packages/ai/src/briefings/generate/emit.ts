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

// Briefing emit orchestration (DEC-05 split from generate.ts) — pre-event,
// post-event, and weekly review.
//
// Each function:
//   1. Loads the `Briefings_Thread` (or creates it once).
//   2. Checks `briefings_emitted` for `(eventId, kind)` to enforce idempotency.
//   3. Builds the briefing body. LLM-authored when budget allows; deterministic
//      stats-only fallback otherwise.
//   4. Persists via `appendAssistantMessage` then writes the
//      `briefings_emitted` row.
//
// Failures are logged and swallowed: the cron handler reports `processed`
// vs total, never propagates a partial failure as a 500.

import { getUserWithSettings } from '@kestrel/db';
import type { BriefingMessagePart, EconomicEvent } from '@kestrel/shared';

import { computeStats } from '../../journal/persistence';
import { runMastraBackgroundText } from '../../mastra-v2';
import { getOrCreateBriefingsThread, recordEmitted, wasEmitted } from '../persistence';
import { blog, envFromProcess, type BriefingsEnv } from './env';
import { isoWeekKey, loadEvent, symbolFromCurrency } from './helpers';
import { appendBriefingMessage, embedBriefingInMemory } from './persist';
import { buildEventPrompt, deterministicEventSummary, deterministicWeeklyReview } from './prompts';

// ---------------------------------------------------------------------------
// Pre / Post event briefings
// ---------------------------------------------------------------------------

export async function emitPreEvent(
  userId: string,
  eventId: string,
): Promise<{ emitted: boolean; reason?: string }> {
  return emitEventBriefing(userId, eventId, 'pre');
}

export async function emitPostEvent(
  userId: string,
  eventId: string,
): Promise<{ emitted: boolean; reason?: string }> {
  return emitEventBriefing(userId, eventId, 'post');
}

async function emitEventBriefing(
  userId: string,
  eventId: string,
  kind: 'pre' | 'post',
): Promise<{ emitted: boolean; reason?: string }> {
  if (await wasEmitted(userId, eventId, kind)) {
    return { emitted: false, reason: 'already_emitted' };
  }

  const event = await loadEvent(eventId);
  if (!event) return { emitted: false, reason: 'event_not_found' };

  const env = envFromProcess();
  const thread = await getOrCreateBriefingsThread(userId);

  const summary = await composeEventSummary(event, kind, env, userId, thread.id);

  // Phase 1 hardening §10 — refuse to burn the (eventId, kind) idempotency
  // slot on a stub. If the LLM and the deterministic fallback both
  // produced a near-empty body, leave the row off `briefings_emitted` so
  // the next cron tick retries. The minimum length floor is conservative
  // (50 chars) — both deterministic paths produce well over that.
  if (summary.trim().length < 50) {
    return { emitted: false, reason: 'summary_too_short' };
  }

  const part: BriefingMessagePart = {
    type: 'briefing',
    eventId,
    kind,
    summary,
  };

  const { messageId } = await appendBriefingMessage(userId, thread.id, summary, part);
  await recordEmitted(userId, eventId, kind, messageId);

  // Phase 7b — embed the briefing into the memory index so it's
  // surfaceable later via `search_knowledge`. Best-effort.
  embedBriefingInMemory({
    messageId,
    body: summary,
    briefingKind: kind,
    occurredAtMs: event.date,
    userId,
    symbol: event.currency ? symbolFromCurrency(event.currency) : undefined,
  });

  return { emitted: true };
}

async function composeEventSummary(
  event: EconomicEvent,
  kind: 'pre' | 'post',
  env: BriefingsEnv,
  userId: string,
  threadId: string,
): Promise<string> {
  try {
    const { settings } = await getUserWithSettings(userId);
    if (!settings) return deterministicEventSummary(event, kind);
    const result = await runMastraBackgroundText({
      userId,
      threadId,
      task: 'briefing',
      prompt: buildEventPrompt(event, kind),
      instructions:
        'You are Kestrel writing a concise economic-event briefing. Use only the supplied event facts. Do not invent market data, promise outcomes, or issue trade instructions. Return at most six short bullets.',
      settings,
      env,
    });
    return result.text.length > 0 ? result.text : deterministicEventSummary(event, kind);
  } catch (error) {
    if (env.LOG_PROMPTS)
      blog.warn('Mastra briefing failed; using deterministic fallback', { err: String(error) });
    return deterministicEventSummary(event, kind);
  }
}

// ---------------------------------------------------------------------------
// Weekly review
// ---------------------------------------------------------------------------

const WEEKLY_REVIEW_KEY = 'weekly_review';

export async function emitWeeklyReview(
  userId: string,
): Promise<{ emitted: boolean; reason?: string }> {
  const env = envFromProcess();
  const thread = await getOrCreateBriefingsThread(userId);

  // Idempotency for the weekly review is keyed on the ISO week boundary
  // so re-running on the same Sunday is a no-op but next Sunday still fires.
  const weekKey = `${WEEKLY_REVIEW_KEY}:${isoWeekKey(new Date())}`;
  if (await wasEmitted(userId, weekKey, 'weekly_review')) {
    return { emitted: false, reason: 'already_emitted_this_week' };
  }

  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stats = await computeStats(userId, { sinceMs });
  if (stats.count === 0) {
    const text = 'No journal entries in the last 7 days. Nothing to review — go log a trade.';
    const { messageId } = await appendBriefingMessage(userId, thread.id, text, {
      type: 'briefing',
      eventId: null,
      kind: 'weekly_review',
      summary: text,
    });
    await recordEmitted(userId, weekKey, 'weekly_review', messageId);
    return { emitted: true };
  }

  // The scoped `computeStats` result above already contains the weekly
  // review metrics. Do not issue a second unscoped journal query here.

  const summary = await composeWeeklyReviewSummary(stats, env, userId, thread.id);
  // Phase 1 hardening §10 — same idempotency-protection as event briefings.
  if (summary.trim().length < 50) {
    return { emitted: false, reason: 'summary_too_short' };
  }
  const { messageId } = await appendBriefingMessage(userId, thread.id, summary, {
    type: 'briefing',
    eventId: null,
    kind: 'weekly_review',
    summary,
  });
  await recordEmitted(userId, weekKey, 'weekly_review', messageId);

  // Phase 7b — embed the weekly review for later memory recall.
  embedBriefingInMemory({
    messageId,
    body: summary,
    briefingKind: 'weekly_review',
    occurredAtMs: Date.now(),
    userId,
  });

  return { emitted: true };
}

async function composeWeeklyReviewSummary(
  stats: Awaited<ReturnType<typeof computeStats>>,
  env: BriefingsEnv,
  userId: string,
  threadId: string,
): Promise<string> {
  const det = deterministicWeeklyReview(stats);

  try {
    const { settings } = await getUserWithSettings(userId);
    if (!settings) return det;
    const result = await runMastraBackgroundText({
      userId,
      threadId,
      task: 'weekly_review',
      prompt: `Stats:\n${det}\n\nWrite the weekly review.`,
      instructions:
        'You are Kestrel writing a concise weekly trading review. Use only the supplied deterministic statistics. Do not invent trades, prices, or performance. Return at most five short bullets.',
      settings,
      env,
    });
    return result.text.length > 0 ? result.text : det;
  } catch (error) {
    if (env.LOG_PROMPTS)
      blog.warn('Mastra weekly review failed; using deterministic fallback', {
        err: String(error),
      });
    return det;
  }
}
