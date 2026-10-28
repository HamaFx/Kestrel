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

// Phase 3 (Jev roadmap) — trader journal edge, stats, and behavioral leaks
// synced into Mastra's resource-scoped working memory.

import { describe, expect, it, vi } from 'vitest';

import {
  mergeTraderProfileIntoWorkingMemory,
  seedWorkingMemoryFromSettings,
  syncTraderProfileToWorkingMemory,
} from '../src/mastra-v2/context/working-memory-seed';

describe('Mastra Working Memory Trader Edge & Risk Profile sync', () => {
  it('merges Trader Edge & Risk Profile into existing working memory without clobbering user preferences', () => {
    const existing = `# User Preferences
- **Default symbol**: XAUUSD
- **Language**: en
- **Timezone**: UTC
`;
    const merged = mergeTraderProfileIntoWorkingMemory(existing, {
      disciplineGrade: 'B',
      winRatePct: 62.5,
      avgR: 1.85,
      strengths: ['72% win rate on XAUUSD during London session'],
      leaks: ['Oversized losses on Fridays after 2 consecutive wins'],
      actionRules: ['Cap risk at 0.5% on Fridays', 'Require 1h BOS before entry'],
    });

    expect(merged).toContain('- **Default symbol**: XAUUSD');
    expect(merged).toContain('# Trader Edge & Risk Profile');
    expect(merged).toContain('62.5% win rate');
    expect(merged).toContain('Oversized losses on Fridays');
    expect(merged).toContain('Cap risk at 0.5% on Fridays');
  });

  it('writes merged profile to Mastra memory instance', async () => {
    const getWorkingMemory = vi.fn().mockResolvedValue(null);
    const updateWorkingMemory = vi.fn().mockResolvedValue(undefined);
    const fakeMemory = { getWorkingMemory, updateWorkingMemory } as never;

    const ok = await syncTraderProfileToWorkingMemory({
      memory: fakeMemory,
      userId: 'user-1',
      threadId: 'journal-coach:user-1',
      settings: { defaultSymbol: 'XAUUSD', language: 'en', timezone: 'UTC' },
      profile: {
        disciplineGrade: 'A',
        winRatePct: 68.0,
        avgR: 2.1,
        strengths: ['Strict 2R target adherence'],
        leaks: ['Early exits in Asian session'],
        actionRules: ['Skip Asian session breakout trades'],
      },
    });

    expect(ok).toBe(true);
    expect(updateWorkingMemory).toHaveBeenCalledTimes(1);
  });

  it('replaces an existing trader profile section without duplicating it', () => {
    const existing = `# User Preferences
- **Default symbol**: XAUUSD
- **Language**: en
- **Timezone**: UTC

# Trader Edge & Risk Profile
- **Edge snapshot**: 20.0% win rate · avg -0.50R · discipline grade D`;

    const merged = mergeTraderProfileIntoWorkingMemory(existing, {
      disciplineGrade: 'A',
      winRatePct: 71.0,
      avgR: 2.4,
      strengths: ['Disciplined London-session entries'],
      leaks: [],
      actionRules: ['Risk 0.5% until 10 closed trades'],
    });

    expect(merged.match(/# Trader Edge & Risk Profile/g)).toHaveLength(1);
    expect(merged).toContain('71.0% win rate');
    expect(merged).not.toContain('20.0% win rate');
    expect(merged).toContain('- **Default symbol**: XAUUSD');
  });

  it('preserves the coach profile when a chat turn re-runs the Drizzle working-memory seed', async () => {
    const existing = `# User Preferences
- **Default symbol**: XAUUSD
- **Language**: en
- **Timezone**: UTC

# Trader Edge & Risk Profile
- **Edge snapshot**: 62.5% win rate · avg 1.85R · discipline grade B`;
    const getWorkingMemory = vi.fn().mockResolvedValue(existing);
    const updateWorkingMemory = vi.fn().mockResolvedValue(undefined);

    const result = await seedWorkingMemoryFromSettings({
      memory: { getWorkingMemory, updateWorkingMemory } as never,
      userId: 'user-1',
      threadId: 'thread-1',
      settings: { defaultSymbol: 'XAUUSD', language: 'en', timezone: 'UTC' },
    });

    expect(result).toEqual({ seeded: false, healthy: true });
    expect(updateWorkingMemory).not.toHaveBeenCalled();
  });
});
