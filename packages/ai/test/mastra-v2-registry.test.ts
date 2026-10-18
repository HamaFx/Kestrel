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

import { LibSQLStore } from '@mastra/libsql';
import { describe, expect, it } from 'vitest';

import { MASTRA_CAPABILITIES } from '../src/mastra';
import {
  assertMastraRegistryComplete,
  createKestrelMastra,
  MASTRA_COMPONENT_REGISTRY,
  MastraComponentKindMismatchError,
  MastraComponentNotRegisteredError,
  mastraRegistrationFor,
  resolveMastraAgent,
  resolveMastraWorkflow,
} from '../src/mastra-v2';

function memoryStore(): LibSQLStore {
  return new LibSQLStore({ id: 'test-store', url: ':memory:' });
}

describe('mastra-v2 capability registry', () => {
  it('maps every declared capability to a Mastra component', () => {
    expect(() => assertMastraRegistryComplete()).not.toThrow();
    for (const id of Object.keys(MASTRA_CAPABILITIES)) {
      expect(mastraRegistrationFor(id), `missing registration for ${id}`).toBeTruthy();
    }
  });

  it('maps research capabilities to workflows and conversation/mutation capabilities to agents/workflows', () => {
    expect(MASTRA_COMPONENT_REGISTRY['xauusd-research']).toEqual({
      kind: 'workflow',
      key: 'xauusdResearch',
      stableSince: '2026-10-18',
    });
    expect(MASTRA_COMPONENT_REGISTRY['xauusd-conversation']).toEqual({
      kind: 'agent',
      key: 'xauusdConversation',
      stableSince: '2026-10-18',
    });
    expect(MASTRA_COMPONENT_REGISTRY['symbol-research']).toEqual({
      kind: 'workflow',
      key: 'symbolResearch',
      stableSince: '2026-10-18',
    });
    expect(MASTRA_COMPONENT_REGISTRY['mutation-workflows']).toEqual({
      kind: 'workflow',
      key: 'mutationWorkflows',
      stableSince: '2026-10-18',
    });
  });

  it('fails closed with a typed error when an agent capability is not yet registered', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(() => resolveMastraAgent(instance, 'xauusd-conversation')).toThrow(
      MastraComponentNotRegisteredError,
    );
  });

  it('fails closed with a typed error when a workflow capability is not yet registered', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(() => resolveMastraWorkflow(instance, 'symbol-research')).toThrow(
      MastraComponentNotRegisteredError,
    );
  });

  it('rejects resolving a component through the wrong kind', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(() => resolveMastraAgent(instance, 'symbol-research')).toThrow(
      MastraComponentKindMismatchError,
    );
    expect(() => resolveMastraWorkflow(instance, 'xauusd-conversation')).toThrow(
      MastraComponentKindMismatchError,
    );
  });

  it('rejects unknown capability ids', () => {
    expect(mastraRegistrationFor('not-a-capability')).toBeNull();
  });

  it('fails closed when a capability has no component registry entry (B-04)', () => {
    // Simulate adding a capability to the manifest without a component
    // mapping: the integrity check is the only thing between a manifest edit
    // and a silently unroutable capability.
    const registry = MASTRA_COMPONENT_REGISTRY as Record<string, unknown>;
    const saved = registry['symbol-research'];
    delete registry['symbol-research'];
    try {
      expect(() => assertMastraRegistryComplete()).toThrow(/missing=symbol-research/);
    } finally {
      registry['symbol-research'] = saved;
    }
    expect(() => assertMastraRegistryComplete()).not.toThrow();
  });
});
