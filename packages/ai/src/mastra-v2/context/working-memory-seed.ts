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

// One-time working-memory seed from Drizzle user preferences. The same module
// also owns the Phase 3 coach sync that merges the trader's journal edge,
// stats, and behavioral leaks into the resource-scoped block.

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { Memory } from '@mastra/memory';

import { sanitizeExternalText } from '../packets/external-content';
import { mlog } from './log';

/**
 * Phase 3 (Jev roadmap) — markdown heading of the coach-synced trader edge and
 * risk profile. `syncTraderProfileToWorkingMemory()` owns this section; the
 * seed below never writes or clears it.
 */
export const TRADER_PROFILE_HEADING = '# Trader Edge & Risk Profile';

/**
 * Hard cap for the merged trader-profile section. Working memory is injected
 * into every turn, so the block must stay compact; the coach summary itself is
 * already bounded upstream.
 */
export const TRADER_PROFILE_MAX_CHARS = 1_200;

/** Per-bullet cap before the section-level cap is applied. */
const TRADER_PROFILE_BULLET_CHARS = 200;

/**
 * Quantitative edge and behavioral summary produced by
 * `journal/coach-insights.ts` and merged into working memory.
 */
export interface TraderProfileSummary {
  /** Coach discipline grade (`A+`…`F`). */
  disciplineGrade: string;
  /** Realized win rate in percent (0–100). */
  winRatePct: number;
  /** Average realized R multiple. */
  avgR: number;
  strengths: readonly string[];
  leaks: readonly string[];
  actionRules: readonly string[];
}

export interface SyncTraderProfileArgs {
  memory: Memory;
  userId: string;
  threadId: string;
  profile: TraderProfileSummary;
  /** Fallback preferences when the resource has no working memory yet. */
  settings?: WorkingMemorySeedArgs['settings'];
}

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

/** Render the sanitized `# Trader Edge & Risk Profile` markdown section. */
function renderTraderProfile(profile: TraderProfileSummary): string {
  const bullets = (items: readonly string[]): string[] =>
    items
      .map((item) => sanitizeExternalText(item, TRADER_PROFILE_BULLET_CHARS))
      .filter((item) => item.length > 0)
      .map((item) => `  - ${item}`);
  const lines = [
    TRADER_PROFILE_HEADING,
    `- **Edge snapshot**: ${profile.winRatePct.toFixed(1)}% win rate · avg ${profile.avgR.toFixed(2)}R · discipline grade ${profile.disciplineGrade}`,
  ];
  const strengths = bullets(profile.strengths);
  if (strengths.length > 0) lines.push('- **Strengths**:', ...strengths);
  const leaks = bullets(profile.leaks);
  if (leaks.length > 0) lines.push('- **Behavioral leaks**:', ...leaks);
  const actionRules = bullets(profile.actionRules);
  if (actionRules.length > 0) lines.push('- **Action rules (non-negotiable)**:', ...actionRules);
  const section = lines.join('\n');
  return section.length > TRADER_PROFILE_MAX_CHARS
    ? `${section.slice(0, TRADER_PROFILE_MAX_CHARS).trimEnd()}\n...`
    : section;
}

/**
 * Replace (or append) one top-level `#` section without touching any other
 * section — the `# User Preferences` block and any agent-maintained blocks
 * survive untouched.
 */
function replaceMarkdownSection(markdown: string, heading: string, section: string): string {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) {
    return `${markdown.trimEnd()}\n\n${section}`.trim();
  }
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^#\s/.test(lines[i] ?? '')) {
      endIndex = i;
      break;
    }
  }
  return [...lines.slice(0, startIndex), ...section.split('\n'), ...lines.slice(endIndex)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Phase 3 — merge the coach's `# Trader Edge & Risk Profile` section into an
 * existing working-memory block. The `# User Preferences` section (and any
 * agent-maintained block) is preserved verbatim; only the trader section is
 * replaced or appended. All coach prose is sanitized and the section is capped
 * at `TRADER_PROFILE_MAX_CHARS`.
 */
export function mergeTraderProfileIntoWorkingMemory(
  existingMarkdown: string | null,
  profile: TraderProfileSummary,
  fallbackSettings?: WorkingMemorySeedArgs['settings'],
): string {
  const base = existingMarkdown?.trim()
    ? existingMarkdown.trim()
    : workingMemoryMarkdown(fallbackSettings ?? {}).trim();
  return replaceMarkdownSection(base, TRADER_PROFILE_HEADING, renderTraderProfile(profile));
}

/**
 * Best-effort write of the merged trader profile into Mastra's resource-scoped
 * working memory. Never throws: the journal review response must not fail
 * because memory is unavailable. Writes are skipped when the stored block
 * already equals the merged content (idempotent re-runs).
 */
export async function syncTraderProfileToWorkingMemory(
  args: SyncTraderProfileArgs,
): Promise<boolean> {
  const { memory, userId, threadId, profile, settings } = args;
  try {
    const existing = await memory.getWorkingMemory({ threadId, resourceId: userId });
    const merged = mergeTraderProfileIntoWorkingMemory(existing, profile, settings);
    if (existing === merged) return true;
    await memory.updateWorkingMemory({
      threadId,
      resourceId: userId,
      workingMemory: merged,
    });
    mlog.info('Synced trader edge & risk profile into working memory', { userId });
    return true;
  } catch (error) {
    mlog.warn('Trader-profile working-memory sync skipped (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
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
 *
 * Phase 3: a block already carrying the coach-synced
 * `# Trader Edge & Risk Profile` section is a non-null, different block and is
 * preserved verbatim — chat turns never overwrite the trader profile with the
 * bare three-line template.
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
