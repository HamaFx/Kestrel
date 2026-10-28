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
 * Phase 3 (Jev roadmap) — bridge from the journal coach review into Mastra's
 * resource-scoped working memory.
 *
 * The coach review already produces the quantitative edge (win rate, average
 * R, discipline grade) and the behavioral leaks; mirroring them into the
 * `# Trader Edge & Risk Profile` working-memory section makes every later chat
 * turn aware of the trader's personal profile. Guarded end to end: memory
 * construction, the read, and the write are all non-fatal so a degraded memory
 * service never fails the user's journal review.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { JournalStats, ServerEnv } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { syncTraderProfileToWorkingMemory } from '../mastra-v2/context/working-memory-seed';

const clog = createCategorizedLogger('ai', { component: 'journal-coach' });

export interface CoachWorkingMemorySyncArgs {
  userId: string;
  threadId: string;
  userSettings: Pick<
    UserSettingsRow,
    'aiApiKeys' | 'embeddingModel' | 'defaultSymbol' | 'language' | 'timezone'
  >;
  env: Pick<ServerEnv, 'AI_GATEWAY_API_KEY' | 'GOOGLE_GENERATIVE_AI_API_KEY'>;
  insights: {
    disciplineGrade: string;
    strengths: readonly string[];
    leaks: readonly string[];
    actionRules: readonly string[];
  };
  stats: Pick<JournalStats, 'winRate' | 'avgR'>;
}

/**
 * Best-effort write of the coach review into the `journal-coach:<userId>`
 * resource working-memory block. Never throws.
 */
export async function syncCoachInsightsToWorkingMemory(
  args: CoachWorkingMemorySyncArgs,
): Promise<boolean> {
  try {
    // The Mastra memory graph is only needed when a review actually runs, so
    // the import stays lazy and off the journal-route startup path.
    const { createKestrelMemory } = await import('../mastra-v2/memory');
    const memory = createKestrelMemory({
      settings: args.userSettings,
      env: args.env,
    });
    return await syncTraderProfileToWorkingMemory({
      memory,
      userId: args.userId,
      threadId: args.threadId,
      settings: {
        defaultSymbol: args.userSettings.defaultSymbol,
        language: args.userSettings.language,
        timezone: args.userSettings.timezone,
      },
      profile: {
        disciplineGrade: args.insights.disciplineGrade,
        winRatePct: args.stats.winRate * 100,
        avgR: args.stats.avgR,
        strengths: args.insights.strengths,
        leaks: args.insights.leaks,
        actionRules: args.insights.actionRules,
      },
    });
  } catch (error) {
    clog.warn({ err: error }, 'Trader-profile working-memory sync skipped (non-fatal)');
    return false;
  }
}
