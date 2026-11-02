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

// Phase 4 Task 3 — the single SSE turn lifecycle shared by the canonical chat,
// custom-agent, and XAUUSD conversation streaming services.
//
// A service supplies only its agent-specific stream factory (`openStream`) and
// its tail (`finalize`): the shared runner owns budget reservation, user
// message persistence, live tool-event framing, the thread-title call, budget
// settlement, and abort/failure finalization.

import 'server-only';

import {
  appendAssistantMessage,
  appendUserMessage,
  createGenerationLedger,
  DEFAULT_MAX_DAILY_USD,
  reserveTurnBudget,
  type GenerationLedger,
} from '@kestrel/ai';
import { getUserWithSettings } from '@kestrel/db';
import type { UserSettingsRow } from '@kestrel/db/schema';
import type { ChatStreamEvent, ServerEnv } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { maybeGenerateThreadTitle } from '@/lib/services/mastra/chat/mastra-thread-title';

import { pushPendingToolPartEvents, type MastraSseToolPart } from './mastra-sse-tool-parts';
import { createMastraStreamFinalizer } from './mastra-stream-finalizer';
import { mastraStreamResponse, type MastraStreamTerminalStatus } from './mastra-stream-response';

/** Tool-event subset of the SSE contract (the events that carry a call id). */
type MastraSseToolEvent = Extract<ChatStreamEvent, { toolCallId: string }>;

export interface MastraSseStream<TCompletion> {
  text: AsyncIterable<string>;
  completion: Promise<TCompletion>;
}

interface MastraSseTurnOpenContext {
  runId: string;
  ledger: GenerationLedger;
  settings: UserSettingsRow;
  env: ServerEnv;
  /**
   * Queue a live tool event for in-band delivery. Events are drained before,
   * between, and after text chunks. `markEmitted: false` keeps the completion
   * tool part eligible for the post-text tail (custom-agent semantics).
   */
  emitToolEvent: (event: MastraSseToolEvent, options?: { markEmitted?: boolean }) => void;
}

interface MastraSseTurnFinalizeContext<TCompletion> {
  runId: string;
  ledger: GenerationLedger;
  settings: UserSettingsRow;
  env: ServerEnv;
  messageId: string;
  userMessage: UIMessage;
  completed: TCompletion;
  /** Ledger total after the title call; the finalizer settles this amount. */
  observedCost: number;
  /** Tail SSE events, emitted after the text stream and before `text-end`. */
  postTextEvents: ChatStreamEvent[];
}

interface MastraSseTurnRecoveryContext {
  error: unknown;
  streamedAnyText: boolean;
  runId: string;
  messageId: string;
  ledger: GenerationLedger;
  postTextEvents: ChatStreamEvent[];
}

interface MastraSseTurnRecovery {
  /** In-band refusal text; omit when unverified tokens already streamed. */
  yieldText?: string;
  assistantMessage: UIMessage;
}

export interface RunMastraSseTurnArgs<
  TCompletion extends { toolParts?: readonly MastraSseToolPart[] | undefined },
  TStream extends MastraSseStream<TCompletion>,
> {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  signal?: AbortSignal;
  /** Idempotency namespace: `<prefix>:<threadId>:<userMessage.id>:...`. */
  idempotencyPrefix: string;
  /** Optional run id (e.g. a service-owned diagnostics trace); generated when absent. */
  runId?: string;
  /** Optional pre-flight (e.g. thread ownership) before settings load. */
  prepare?: () => Promise<void>;
  /** Build the agent-specific stream for this turn. */
  openStream: (context: MastraSseTurnOpenContext) => Promise<TStream>;
  /** Title inputs for the bounded title call; return null to skip it. */
  title?: (context: {
    completed: TCompletion;
    runId: string;
    ledger: GenerationLedger;
  }) => { firstUser: string; firstAssistant: string } | null;
  /** Build the assistant message; the runner persists it with the turn key. */
  finalize: (context: MastraSseTurnFinalizeContext<TCompletion>) => Promise<UIMessage>;
  /**
   * Recover a `stream.completion` rejection in-band (e.g. the canonical
   * evidence gate). Return null to rethrow.
   */
  recoverCompletion?: (
    context: MastraSseTurnRecoveryContext,
  ) => Promise<MastraSseTurnRecovery | null>;
  /** Post-settle hook (custom-agent run records and terminal diagnostics). */
  afterSettle?: (context: {
    completed: TCompletion;
    observedCost: number;
    terminalStatus: MastraStreamTerminalStatus;
  }) => Promise<void>;
  /** Failure hook, after the finalizer fails and before the error rethrows. */
  onFailure?: (context: {
    error: unknown;
    ledger: GenerationLedger;
    aborted: boolean;
  }) => Promise<void>;
  /** Called before the finalizer aborts a client-disconnected stream. */
  onAbort?: () => Promise<void>;
}

export async function runMastraSseTurn<
  TCompletion extends { toolParts?: readonly MastraSseToolPart[] | undefined },
  TStream extends MastraSseStream<TCompletion>,
>(args: RunMastraSseTurnArgs<TCompletion, TStream>): Promise<Response> {
  await args.prepare?.();

  const { settings } = await getUserWithSettings(args.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');
  const userSettings: UserSettingsRow = settings;

  const env = getServerEnv();
  const runId = args.runId ?? crypto.randomUUID();
  const ledger = createGenerationLedger();
  const budget = await reserveTurnBudget({
    userId: args.userId,
    maxDailyUsd: userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: args.threadId, runId },
  });

  const assistantKey = `${args.idempotencyPrefix}:${args.threadId}:${args.userMessage.id}:assistant`;
  const finalizer = createMastraStreamFinalizer({
    budget,
    onInterrupted: async () => {
      await appendAssistantMessage(
        args.userId,
        args.threadId,
        {
          id: runId,
          role: 'assistant',
          parts: [{ type: 'text', text: '_Stream interrupted — please retry._' }],
        },
        {
          idempotencyKey: `${args.idempotencyPrefix}:${args.threadId}:${args.userMessage.id}:interrupted`,
        },
      ).catch(() => undefined);
    },
  });

  try {
    await appendUserMessage(args.userId, args.threadId, args.userMessage);

    const liveToolEvents: ChatStreamEvent[] = [];
    const emittedToolCallIds = new Set<string>();
    const emitToolEvent = (
      event: MastraSseToolEvent,
      options?: { markEmitted?: boolean },
    ): void => {
      if (options?.markEmitted !== false) emittedToolCallIds.add(event.toolCallId);
      liveToolEvents.push(event);
    };

    const stream = await args.openStream({
      runId,
      ledger,
      settings: userSettings,
      env,
      emitToolEvent,
    });
    const messageId = crypto.randomUUID();
    let terminalStatus: MastraStreamTerminalStatus = 'failed';
    const postTextEvents: ChatStreamEvent[] = [];

    const drainLiveToolEvents = function* (): Generator<ChatStreamEvent> {
      while (liveToolEvents.length > 0) {
        const event = liveToolEvents.shift();
        if (event) yield event;
      }
    };

    async function* text(): AsyncIterable<string | ChatStreamEvent> {
      let streamedAnyText = false;
      try {
        yield* drainLiveToolEvents();
        for await (const chunk of stream.text) {
          yield* drainLiveToolEvents();
          if (chunk.length > 0) {
            streamedAnyText = true;
            yield chunk;
          }
        }
        yield* drainLiveToolEvents();

        let completed: TCompletion;
        try {
          completed = await stream.completion;
        } catch (error) {
          const recovery = args.recoverCompletion
            ? await args.recoverCompletion({
                error,
                streamedAnyText,
                runId,
                messageId,
                ledger,
                postTextEvents,
              })
            : null;
          if (!recovery) throw error;
          if (recovery.yieldText) yield recovery.yieldText;
          await appendAssistantMessage(args.userId, args.threadId, recovery.assistantMessage, {
            idempotencyKey: assistantKey,
          });
          terminalStatus = 'persisted';
          await finalizer.complete(ledger.total());
          return;
        }

        pushPendingToolPartEvents(completed.toolParts ?? [], emittedToolCallIds, postTextEvents);

        if (args.title) {
          const titleInputs = args.title({ completed, runId, ledger });
          if (titleInputs) {
            // P2-06: title spend lands in the per-turn ledger, so await the
            // bounded title call before snapshotting the cost.
            await maybeGenerateThreadTitle({
              userId: args.userId,
              threadId: args.threadId,
              firstUser: titleInputs.firstUser,
              firstAssistant: titleInputs.firstAssistant,
              ledger,
              ledgerId: `title:${runId}`,
            });
          }
        }

        const observedCost = ledger.total();
        const assistantMessage = await args.finalize({
          runId,
          ledger,
          settings: userSettings,
          env,
          messageId,
          userMessage: args.userMessage,
          completed,
          observedCost,
          postTextEvents,
        });
        try {
          await appendAssistantMessage(args.userId, args.threadId, assistantMessage, {
            idempotencyKey: assistantKey,
          });
          terminalStatus = 'persisted';
        } catch (error) {
          terminalStatus = 'persistence-failed';
          throw error;
        }
        await finalizer.complete(observedCost);
        await args.afterSettle?.({ completed, observedCost, terminalStatus });
      } catch (error) {
        const aborted = args.signal?.aborted ?? false;
        if (aborted) await finalizer.abort();
        else await finalizer.fail();
        await args.onFailure?.({ error, ledger, aborted });
        throw error;
      }
    }

    return mastraStreamResponse(text(), messageId, {
      afterTextEvents: () => postTextEvents,
      signal: args.signal,
      onAbort: async () => {
        terminalStatus = 'interrupted';
        await args.onAbort?.();
        await finalizer.abort();
      },
      onComplete: () => (terminalStatus === 'persisted' ? 'persisted' : terminalStatus),
    });
  } catch (error) {
    if (args.signal?.aborted) await finalizer.abort();
    else await finalizer.fail();
    throw error;
  }
}
