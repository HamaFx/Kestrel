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

// I-02 (audit 2026-10-18) — the Agent Network experiment must stay OFF by
// default, build the documented readers/supervisor shape, and fail closed
// when a caller tries to run it without the opt-in flag.

import type { LanguageModel } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_NETWORK_READERS,
  createCanonicalNetworkExperiment,
  isCanonicalNetworkExperimentEnabled,
  runCanonicalNetworkExperiment,
} from '../src/mastra-v2/agents/canonical/network-experiment';

const model = {} as LanguageModel;

describe('canonical Agent Network experiment (I-02)', () => {
  it('is disabled unless PHASE_AGENT_NETWORK is explicitly opt-in', () => {
    expect(isCanonicalNetworkExperimentEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isCanonicalNetworkExperimentEnabled({ PHASE_AGENT_NETWORK: '' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
    expect(isCanonicalNetworkExperimentEnabled({ PHASE_AGENT_NETWORK: '0' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
    expect(isCanonicalNetworkExperimentEnabled({ PHASE_AGENT_NETWORK: '1' } as NodeJS.ProcessEnv)).toBe(
      true,
    );
    expect(
      isCanonicalNetworkExperimentEnabled({ PHASE_AGENT_NETWORK: 'true' } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('builds one routing supervisor plus the three reader sub-agents', async () => {
    const experiment = createCanonicalNetworkExperiment({ model });

    expect(experiment.supervisor.id).toBe('kestrel-canonical-network-supervisor');
    expect(Object.keys(experiment.readers).sort()).toEqual([
      'fundamentalReader',
      'journalReader',
      'technicalReader',
    ]);
    for (const [name, definition] of Object.entries(CANONICAL_NETWORK_READERS)) {
      expect(experiment.readers[name as keyof typeof CANONICAL_NETWORK_READERS].id).toBe(
        definition.agentId,
      );
    }

    // Public delegation surface: the supervisor can enumerate its readers.
    const listed = await Promise.resolve(experiment.supervisor.listAgents());
    expect(Object.keys(listed).sort()).toEqual([
      'fundamentalReader',
      'journalReader',
      'technicalReader',
    ]);
  });

  it('fails closed when run without the opt-in flag', async () => {
    const experiment = createCanonicalNetworkExperiment({ model });
    await expect(
      runCanonicalNetworkExperiment({ supervisor: experiment.supervisor, messages: 'hi' }),
    ).rejects.toThrow(/disabled/);
  });
});
