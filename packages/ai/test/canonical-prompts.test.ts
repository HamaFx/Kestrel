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

// Phase 4 (roadmap Phase 5) — the canonical system prompt must authorize the
// installed virtual-execution plugins while never weakening the real-money ban.

import { describe, expect, it } from 'vitest';

import { systemInstructions } from '../src/mastra-v2/agents/canonical/prompts';

const routing = { domain: 'technical' as const, planRequired: true, rationale: 'test' };

describe('systemInstructions plugin awareness', () => {
  it('instructs the canonical agent how to use installed backtesting and paper-trading plugin tools', () => {
    const text = systemInstructions(routing, undefined, 'default', false, [
      'backtesting',
      'paper-trading',
    ]);

    expect(text).toContain('paper-trading');
    expect(text).toContain('backtesting');
    expect(text).not.toContain('Mutation tools are deliberately not exposed in this agent');
    expect(text).toContain('Never place real-money brokerage trades');
    expect(text).toContain("status 'confirmation_required'");
    expect(text).toContain('backtest_*');
    expect(text).toContain('paper_*');
  });

  it('keeps the read-only mutation policy when no plugins are installed', () => {
    const text = systemInstructions(routing, undefined, 'default', false, []);

    expect(text).toContain('Mutation tools are deliberately not exposed in this agent');
    expect(text).toContain('Never place trades.');
    expect(text).not.toContain('Never place real-money brokerage trades');
    expect(text).toContain('read-only market research and planning');
  });
});
