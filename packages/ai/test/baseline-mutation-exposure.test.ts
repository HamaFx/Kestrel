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

// Phase 0 — no mutation tool is exposed to read-only agents. This is the
// baseline companion to the manifest integrity check in
// mastra/capabilities.ts: every read-only capability and every committee
// specialist must be structurally unable to reach write tools.

import { describe, expect, it } from 'vitest';

import { FUSION_AGENT_ID, SPECIALIST_DEFINITIONS } from '../src/committee/specialists';
import { MODE_POLICY, SPECIALISTS_BY_MODE } from '../src/committee/types';
import {
  MASTRA_CAPABILITIES,
  SENSITIVE_USER_READ_TOOL_NAMES,
  type MastraCapabilityId,
} from '../src/mastra/capabilities';
import { adaptLegacyReadOnlyTools } from '../src/mastra/legacy-tool-adapter';

const MUTATION_CAPABILITY_ID = 'mutation-workflows' as const;
const MUTATION_TOOL_NAMES: readonly string[] = MASTRA_CAPABILITIES[MUTATION_CAPABILITY_ID]!.tools;

const READ_ONLY_CAPABILITIES = Object.entries(MASTRA_CAPABILITIES).filter(
  ([, capability]) => capability.readOnly,
) as Array<[string, (typeof MASTRA_CAPABILITIES)[MastraCapabilityId]]>;

describe('Phase 0 no-mutation-tool exposure', () => {
  it('declares exactly one write capability whose tools are all mutations', () => {
    const writeCapabilities = Object.entries(MASTRA_CAPABILITIES).filter(
      ([, capability]) => !capability.readOnly,
    );
    expect(writeCapabilities.map(([id]) => id)).toEqual([MUTATION_CAPABILITY_ID]);

    const mutation = MASTRA_CAPABILITIES[MUTATION_CAPABILITY_ID]!;
    expect(mutation.requiresConfirmation).toBe(true);
    expect(mutation.tools.length).toBeGreaterThan(0);
    for (const tool of mutation.toolMetadata) {
      expect(tool.access).toBe('write');
      expect(tool.category).toBe('mutation');
    }
    for (const tool of mutation.tools) {
      expect(MUTATION_TOOL_NAMES).toContain(tool);
    }
  });

  it('excludes every mutation tool from every read-only capability', () => {
    expect(READ_ONLY_CAPABILITIES.length).toBeGreaterThan(0);
    for (const [id, capability] of READ_ONLY_CAPABILITIES) {
      for (const tool of capability.tools) {
        expect(
          MUTATION_TOOL_NAMES.includes(tool),
          `${id} must not expose mutation tool ${tool}`,
        ).toBe(false);
      }
      for (const tool of capability.toolMetadata) {
        expect(tool.access, `${id} metadata must not be write access`).not.toBe('write');
        expect(tool.category, `${id} metadata must not be a mutation category`).not.toBe(
          'mutation',
        );
      }
    }
  });

  it('keeps sensitive user-scoped reads out of canonical chat', () => {
    const canonical = MASTRA_CAPABILITIES['canonical-chat'];
    for (const sensitiveTool of SENSITIVE_USER_READ_TOOL_NAMES) {
      expect(canonical.tools).not.toContain(sensitiveTool);
    }
    expect(SENSITIVE_USER_READ_TOOL_NAMES.length).toBeGreaterThan(0);
  });

  it('declares every committee specialist read-only with no write tools', () => {
    expect(Object.keys(SPECIALIST_DEFINITIONS).sort()).toEqual([
      'fundamental',
      'risk',
      'sentiment',
      'technical',
    ]);
    for (const definition of Object.values(SPECIALIST_DEFINITIONS)) {
      expect(definition.readOnly).toBe(true);
    }
    // The synthesizer is the only write-capable committee layer, and its
    // agent id must never collide with a specialist identity.
    expect(MUTATION_TOOL_NAMES).not.toContain(FUSION_AGENT_ID);
    expect(Object.values(SPECIALIST_DEFINITIONS).map((d) => d.agentId)).not.toContain(
      FUSION_AGENT_ID,
    );
  });

  it('keeps committee mode composition consistent with the baseline', () => {
    for (const mode of Object.keys(SPECIALISTS_BY_MODE) as Array<
      keyof typeof SPECIALISTS_BY_MODE
    >) {
      expect(MODE_POLICY[mode].specialists).toEqual(SPECIALISTS_BY_MODE[mode]);
    }
    // Full mode is all-or-nothing; mutation or partial outputs are terminal.
    expect(MODE_POLICY.full.strict).toBe(true);
    expect(MODE_POLICY.full.continueOnPartialFailure).toBe(false);
  });

  it('rejects mutation tools even when a read-only adapter receives one', () => {
    for (const mutationTool of MUTATION_TOOL_NAMES) {
      expect(() =>
        adaptLegacyReadOnlyTools({
          [mutationTool]: { description: 'write tool' } as never,
        }),
      ).toThrow('mutation tools are forbidden');
    }
  });
});
