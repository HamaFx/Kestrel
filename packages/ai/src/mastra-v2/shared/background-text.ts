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

import type { UserSettingsRow } from '@kestrel/db/schema';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { RequestContext } from '@mastra/core/request-context';
import type { z } from 'zod';

import { reserveTurnBudget } from '@ai/budget';
import {
  DEFAULT_MAX_DAILY_USD,
  DEFAULT_TURN_ESTIMATE_USD,
  estimateCostUsd,
} from '@ai/budget/pricing-catalog';
import type { ResolveModelEnv } from '@ai/models/env-factory';
import { resolveMastraExecutionModel, type ChatModelResolution } from '@ai/models/model';
import { createGenerationLedger, type GenerationLedger } from '@ai/persistence/generation-ledger';
import { getDb } from '@ai/runtime/db';
import { telemetryConfig } from '@ai/runtime/telemetry';
import { createToolContext, type ToolEnv, withToolContext } from '@ai/runtime/tool-context';

import { jsonPromptInjectionForModel } from '../../committee/structured-output';
import { manifestForCapability } from '../capabilities';
import { buildGuardrailInputProcessors } from '../guardrails';
import {
  beginMastraRun,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from './telemetry';

/** Bound a tool-enabled background turn; each extra step is another LLM call. */
const BACKGROUND_TOOL_MAX_STEPS = 4;

export interface RunMastraBackgroundTextArgs {
  userId: string;
  threadId: string;
  task: 'briefing' | 'weekly_review' | 'title' | 'journal_review' | 'bot';
  prompt: string;
  instructions: string;
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel' | 'maxDailyUsd'>;
  env: ResolveModelEnv;
  signal?: AbortSignal;
  skipInputGuardrails?: boolean;
  /** Conservative reservation for this bounded background generation. */
  estimateUsd?: number;
  /** Optional structured output contract (journal coach insights). */
  structuredSchema?: z.ZodType<Record<string, unknown>>;
  /** Instructions for the structured-output call. */
  structuredInstructions?: string;
  ledger?: GenerationLedger;
  ledgerId?: string;
  /**
   * Register the public read-only canonical tool belt. Bot free-form
   * questions ("what is on the calendar?", "how are my positions?") need
   * live data; briefings, titles, and reviews stay tool-free.
   */
  readOnlyTools?: boolean;
}

export interface MastraBackgroundTextResult {
  text: string;
  runId: string;
  modelId: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  /** Parsed structured output when `structuredSchema` was supplied. */
  object?: unknown;
}

function resolveBackgroundModel(
  settings: RunMastraBackgroundTextArgs['settings'],
  env: ResolveModelEnv,
): ChatModelResolution {
  return resolveMastraExecutionModel({
    purpose: 'worker',
    settings,
    env,
    domain: 'summary',
  });
}

/** Public read-only tools only; the sensitive user-read set stays in chat. */
async function readOnlyToolBelt(): Promise<Record<string, unknown>> {
  const [{ nativeCanonicalTools }, { CANONICAL_PUBLIC_READ_ONLY_SET }] = await Promise.all([
    import('../tools/canonical'),
    import('../agents/canonical/allowlist'),
  ]);
  return Object.fromEntries(
    Object.entries(nativeCanonicalTools()).filter(([name]) =>
      CANONICAL_PUBLIC_READ_ONLY_SET.has(name),
    ),
  );
}

function optionalDb(): ReturnType<typeof getDb> | undefined {
  try {
    return getDb();
  } catch {
    // Unit tests without database env config run tools that do not need it.
    return undefined;
  }
}

/**
 * Execute one bounded, read-only background generation. Persistence and
 * idempotency remain owned by the caller; this helper only owns model
 * execution, cancellation, and Mastra run telemetry.
 */
export async function runMastraBackgroundText(
  args: RunMastraBackgroundTextArgs,
): Promise<MastraBackgroundTextResult> {
  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  let resolution: ChatModelResolution | null = null;
  let budget: Awaited<ReturnType<typeof reserveTurnBudget>> | null = null;

  try {
    budget = await reserveTurnBudget({
      userId: args.userId,
      estimateUsd: args.estimateUsd ?? DEFAULT_TURN_ESTIMATE_USD,
      maxDailyUsd: args.settings.maxDailyUsd ?? DEFAULT_MAX_DAILY_USD,
      correlation: { threadId: args.threadId, runId },
    });
    const model = resolveBackgroundModel(args.settings, args.env);
    resolution = model;
    beginMastraRun({
      runId,
      threadId: args.threadId,
      model: model.modelId,
      providerId: model.providerId,
    });

    const guardrails = args.skipInputGuardrails
      ? []
      : buildGuardrailInputProcessors({
          settings: { aiApiKeys: args.settings.aiApiKeys, chatModel: args.settings.chatModel },
          env: args.env,
          strategy: 'block',
          mode: 'availability',
        }).processors;

    const toolBelt = args.readOnlyTools ? await readOnlyToolBelt() : {};
    const hasTools = Object.keys(toolBelt).length > 0;
    const agent = new Agent({
      id: `kestrel-mastra-worker-${args.task}`,
      name: `Kestrel Mastra ${args.task}`,
      description: 'Bounded read-only background generation for Kestrel.',
      model: model.model as unknown as MastraModelConfig,
      instructions: args.instructions,
      ...(guardrails.length > 0 ? { inputProcessors: guardrails } : {}),
      ...(hasTools ? { tools: toolBelt as never } : {}),
    });
    const requestContext = new RequestContext([
      ['userId', args.userId],
      ['threadId', args.threadId],
      ['runId', runId],
      ['backgroundTask', args.task],
    ]);
    const baseOptions = {
      requestContext,
      toolChoice: hasTools ? ('auto' as const) : ('none' as const),
      maxSteps: hasTools
        ? BACKGROUND_TOOL_MAX_STEPS
        : manifestForCapability('canonical-chat').maxSteps > 0
          ? 1
          : 0,
      ...(args.task === 'title' ? { maxOutputTokens: 80 } : { maxOutputTokens: 2_000 }),
      ...telemetryConfig({
        functionId: `mastra.worker.${args.task}`,
        metadata: { task: args.task, provider: model.providerId },
      }),
      ...(args.signal ? { abortSignal: args.signal } : {}),
    };
    const generate = () =>
      args.structuredSchema
        ? agent.generate(args.prompt, {
            ...baseOptions,
            structuredOutput: {
              schema: args.structuredSchema,
              jsonPromptInjection: jsonPromptInjectionForModel(model.model),
              ...(args.structuredInstructions ? { instructions: args.structuredInstructions } : {}),
            },
          })
        : agent.generate(args.prompt, baseOptions);
    // Tools resolve their tenant scope and settings from the async tool
    // context; without it every tool call throws outside `runChat()`.
    const result = hasTools
      ? await withToolContext(
          createToolContext({
            threadId: args.threadId,
            userId: args.userId,
            latestUserMessageText: args.prompt,
            env: args.env as Partial<ToolEnv>,
            signal: args.signal ?? null,
            budget: { spent: 0, max: args.settings.maxDailyUsd ?? DEFAULT_MAX_DAILY_USD },
            userSettings: args.settings as UserSettingsRow,
            db: optionalDb(),
          }),
          generate,
        )
      : await generate();
    const stats = getMastraGenerationStats(result);
    const structuredObject = (result as { object?: unknown }).object;
    const costUsd = estimateCostUsd(model.modelId, stats.inputTokens, stats.outputTokens);
    const ledger = args.ledger ?? createGenerationLedger();
    ledger.recordCost(args.ledgerId ?? `background:${runId}`, 'auxiliary', costUsd);
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId,
      model: model.modelId,
      providerId: model.providerId,
      startedAt,
      ...stats,
      outcome: 'success',
      answerOutcome:
        result.text.trim().length > 0 || structuredObject !== undefined ? 'ready' : 'degraded',
      telemetryKind: 'mastra_worker_task',
    });
    // The helper owns admission for every caller, including cron, bot, and
    // title paths. Reconcile only after the model run has a terminal result.
    await budget.reconcile(costUsd);

    return {
      text: result.text.trim(),
      runId,
      modelId: model.modelId,
      providerId: model.providerId,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      costUsd,
      latencyMs: Date.now() - startedAt,
      ...(structuredObject !== undefined ? { object: structuredObject } : {}),
    };
  } catch (error) {
    await finishMastraRun({
      userId: args.userId,
      threadId: args.threadId,
      runId,
      model: resolution?.modelId ?? 'unresolved',
      providerId: resolution?.providerId ?? 'unresolved',
      startedAt,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      steps: 0,
      outcome: mastraOutcomeForError(error, args.signal),
      telemetryKind: 'mastra_worker_task',
      error,
    });
    if (budget) await budget.release();
    throw error;
  }
}
