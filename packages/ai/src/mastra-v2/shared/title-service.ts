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

/**
 * Shared best-effort thread-title orchestration.
 *
 * Web chat services and the durable full-analysis worker both call this after
 * persisting the first assistant message of an untitled thread. It never
 * throws: model failures fall back to a deterministic title, and the untitled
 * check is race-safe so a concurrent writer wins.
 *
 * `timeoutMs` (P2-06): awaiting callers that settle the turn's budget
 * reservation must not hang on a slow title model. When the budget elapses the
 * in-flight LLM call is aborted and the deterministic fallback title is
 * persisted, so no title spend is recorded after settlement.
 */

import { getUserWithSettings } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { deriveTitleModel, type ResolveModelEnv } from '../../models/model';
import { getThread, updateThreadTitle } from '../../persistence';
import type { GenerationLedger } from '../../persistence/generation-ledger';
import { generateThreadTitle } from './title';

const tilog = createCategorizedLogger('ai', { component: 'thread-title' });

export interface MaybeGenerateThreadTitleArgs {
  userId: string;
  threadId: string;
  /** Plain text of the first user message in the thread. */
  firstUser: string;
  /** Plain text of the assistant reply just persisted. */
  firstAssistant: string;
  env: ResolveModelEnv;
  /** Optional budget/cost sink supplied by the parent turn. */
  accounting?: {
    onComplete?: (costUsd: number) => void | Promise<void>;
  };
  ledger?: GenerationLedger;
  ledgerId?: string;
  /**
   * Bound the title LLM call (P2-06). Required by web paths that await this
   * call before settling the turn budget; the durable worker bills the exact
   * spend and therefore leaves it unbounded.
   */
  timeoutMs?: number;
}

export async function maybeGenerateThreadTitle(args: MaybeGenerateThreadTitleArgs): Promise<void> {
  const { userId, threadId, firstUser, firstAssistant, env, timeoutMs } = args;
  try {
    // Race-safe guard: only title threads that are still untitled.
    const thread = await getThread(userId, threadId);
    if (!thread || thread.titleSource != null) return;

    const { settings } = await getUserWithSettings(userId);
    const titleModelId = deriveTitleModel(
      { aiApiKeys: settings?.aiApiKeys ?? null, chatModel: settings?.chatModel ?? null },
      env,
    );
    if (!titleModelId) {
      // No resolvable model — persist the deterministic fallback so the
      // thread still gets a stable title.
      await updateThreadTitle(userId, threadId, firstUser.trim().slice(0, 60), 'fallback');
      return;
    }

    const timeoutController =
      timeoutMs !== undefined && timeoutMs > 0 ? new AbortController() : null;
    const timeoutTimer = timeoutController
      ? setTimeout(
          () =>
            timeoutController.abort(
              new DOMException('Thread-title generation timed out', 'TimeoutError'),
            ),
          timeoutMs,
        )
      : null;
    let result: Awaited<ReturnType<typeof generateThreadTitle>>;
    try {
      result = await generateThreadTitle({
        userId,
        threadId,
        firstUser,
        firstAssistant,
        titleModelId,
        env,
        ...(settings ? { settings } : {}),
        ...(args.accounting ? { accounting: args.accounting } : {}),
        ...(args.ledger ? { ledger: args.ledger } : {}),
        ...(args.ledgerId ? { ledgerId: args.ledgerId } : {}),
        ...(timeoutController ? { signal: timeoutController.signal } : {}),
      });
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }
    await updateThreadTitle(userId, threadId, result.title, result.source);
    tilog.debug(
      { threadId, source: result.source, reason: result.reason },
      'thread title generated',
    );
  } catch (error) {
    tilog.warn(
      { threadId, error: error instanceof Error ? error.message : String(error) },
      'thread title generation failed (thread stays untitled)',
    );
  }
}
