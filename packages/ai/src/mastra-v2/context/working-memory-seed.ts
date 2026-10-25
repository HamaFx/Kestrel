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

// One-time working-memory seed from Drizzle user preferences.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { Memory } from '@mastra/memory';

import { mlog } from './log';

export interface WorkingMemorySeedArgs {
  memory: Memory;
  userId: string;
  threadId: string;
  /**
   * Model-visible user preferences only. Runtime configuration (model pick,
   * provider, budget, limits) is never seeded into model-visible memory.
   * Nullable: research-context callers pass row fields that Postgres may
   * surface as null (Phase 9); null falls back to the template default.
   */
  settings: Partial<{
    defaultSymbol: UserSettingsRow['defaultSymbol'] | null;
    language: UserSettingsRow['language'] | null;
    timezone: UserSettingsRow['timezone'] | null;
  }>;
}

export interface WorkingMemorySeedResult {
  /** Working memory now reflects the Drizzle user preferences. */
  seeded: boolean;
  /** False when the seed could not be read or written (memory degraded). */
  healthy: boolean;
}

function workingMemoryMarkdown(settings: WorkingMemorySeedArgs['settings']): string {
  return `# User Preferences
- **Default symbol**: ${settings.defaultSymbol ?? 'XAUUSD'}
- **Language**: ${settings.language ?? 'en'}
- **Timezone**: ${settings.timezone ?? 'UTC'}
`;
}

/**
 * One-time working-memory seed from Drizzle user preferences. Resource-scoped,
 * so it is written once per user and preserved across threads; the agent then
 * owns updates.
 *
 * Idempotency is content-addressed (Phase 9): if the stored working memory
 * already equals this seed exactly, it is a successful no-op; an existing
 * agent-maintained memory block is never clobbered. Two processes racing on an
 * empty store both write identical deterministic content, so the final state
 * is the same regardless of who wins.
 */
export async function seedWorkingMemoryFromSettings(
  args: WorkingMemorySeedArgs,
): Promise<WorkingMemorySeedResult> {
  const { memory, userId, threadId, settings } = args;
  const seed = workingMemoryMarkdown(settings);
  try {
    const existing = await memory.getWorkingMemory({ threadId, resourceId: userId });
    if (existing === seed) return { seeded: true, healthy: true };
    // A non-null, different block is agent-maintained memory — never
    // overwrite runtime configuration that the agent has evolved.
    if (existing !== null) return { seeded: false, healthy: true };
    await memory.updateWorkingMemory({
      threadId,
      resourceId: userId,
      workingMemory: seed,
    });
    mlog.info('Seeded working memory from Drizzle preferences', { userId });
    return { seeded: true, healthy: true };
  } catch (error) {
    // Memory is a context aid, never a hard dependency: degrade gracefully
    // and signal the degradation to telemetry/metadata callers.
    mlog.warn('Working-memory seed skipped (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { seeded: false, healthy: false };
  }
}
