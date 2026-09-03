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
 * Shared research-run context (Phase 7). The XAUUSD report/followup,
 * XAUUSD conversation/stream, and committee mode runners all prepare native
 * memory, guardrails, and scorers the same way. This builder is the single
 * place that preparation lives so each capability keeps only domain logic.
 *
 * The builder is not a policy decision: callers choose which policies to
 * build (`includeConversationPolicies` for conversational agents,
 * `includeResearchPolicies` for verified-report agents) and how memory is
 * configured (`memoryOptions`, e.g. observational memory on durable paths).
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { MemoryConfigInternal } from '@mastra/core/memory';
import type { Memory } from '@mastra/memory';

import type { ResolveModelEnv } from '../vertex-factory';
import { prepareKestrelMemory, type PreparedKestrelMemory } from './context';
import { buildConversationScorers, buildResearchScorers, type BuiltScorers } from './evals/scorers';
import { buildConversationGuardrails, buildResearchGuardrails } from './guardrails';
import { createKestrelMemory } from './memory';

export interface ResearchRunContextSettings {
  aiApiKeys: UserSettingsRow['aiApiKeys'];
  chatModel: UserSettingsRow['chatModel'] | null;
  embeddingModel?: UserSettingsRow['embeddingModel'] | null;
  /** Model-visible user preferences for the working-memory seed (Phase 9). */
  defaultSymbol?: UserSettingsRow['defaultSymbol'] | null;
  language?: UserSettingsRow['language'] | null;
  timezone?: UserSettingsRow['timezone'] | null;
}

export interface PrepareResearchRunContextArgs {
  userId: string;
  threadId: string;
  settings: ResearchRunContextSettings;
  env: ResolveModelEnv;
  /** Memory configuration; defaults to the standard Kestrel memory options. */
  memoryOptions?: MemoryConfigInternal;
  /** Idempotency key of the current user message already stored in Drizzle. */
  backfillExcludeMessageIdempotencyKey?: string;
  /** Build conversation guardrails + scorers (conversational agent policy). */
  includeConversationPolicies?: boolean;
  /** Build research guardrails + scorers (verified-report agent policy). */
  includeResearchPolicies?: boolean;
}

export interface PreparedResearchRunContext {
  memory: Memory;
  /** Prepared call options (thread/resource scoping + backfill exclusions). */
  prepared: PreparedKestrelMemory;
  /** Conversation guardrails + scorers, when requested. */
  conversation: {
    guardrails: ReturnType<typeof buildConversationGuardrails>;
    scorers: BuiltScorers;
  } | null;
  /** Research guardrails + scorers, when requested. */
  research: {
    guardrails: ReturnType<typeof buildResearchGuardrails>;
    scorers: BuiltScorers;
  } | null;
}

export async function prepareResearchRunContext(
  args: PrepareResearchRunContextArgs,
): Promise<PreparedResearchRunContext> {
  const memory = createKestrelMemory({
    settings: {
      aiApiKeys: args.settings.aiApiKeys,
      embeddingModel: args.settings.embeddingModel ?? null,
    },
    env: args.env,
    ...(args.memoryOptions ? { options: args.memoryOptions } : {}),
  });
  const prepared = await prepareKestrelMemory({
    memory,
    userId: args.userId,
    threadId: args.threadId,
    settings: {
      defaultSymbol: args.settings.defaultSymbol ?? null,
      language: args.settings.language ?? null,
      timezone: args.settings.timezone ?? null,
    },
    backfill: true,
    ...(args.backfillExcludeMessageIdempotencyKey
      ? { excludeMessageIdempotencyKey: args.backfillExcludeMessageIdempotencyKey }
      : {}),
  });

  const guardrailSettings = {
    aiApiKeys: args.settings.aiApiKeys,
    chatModel: args.settings.chatModel,
  };
  return {
    memory,
    prepared,
    conversation:
      args.includeConversationPolicies === true
        ? {
            guardrails: buildConversationGuardrails(guardrailSettings, args.env),
            scorers: buildConversationScorers(guardrailSettings, args.env),
          }
        : null,
    research:
      args.includeResearchPolicies === true
        ? {
            guardrails: buildResearchGuardrails(guardrailSettings, args.env),
            scorers: buildResearchScorers(guardrailSettings, args.env),
          }
        : null,
  };
}
