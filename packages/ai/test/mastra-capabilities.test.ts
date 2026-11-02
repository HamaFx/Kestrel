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

import { describe, expect, it } from 'vitest';

import {
  assertCapabilityManifestIntegrity,
  capabilityTelemetryLabels,
  capabilityUiMetadata,
  evaluateMastraCapability,
  getMastraCapability,
  manifestToolsForDomain,
  MASTRA_CAPABILITIES,
  type MastraCapability,
} from '../src/mastra-v2';
import { READ_ONLY_TOOL_NAMES } from '../src/mastra-v2/agents/canonical/allowlist';
import { nativeCanonicalTools } from '../src/mastra-v2/tools/canonical';

describe('Mastra capability policy', () => {
  it('keeps the manifest internally consistent and mutation-safe', () => {
    expect(() => assertCapabilityManifestIntegrity()).not.toThrow();
    for (const capability of Object.values(MASTRA_CAPABILITIES)) {
      expect(capability.toolMetadata.map((tool) => tool.name)).toEqual([...capability.tools]);
      if (capability.readOnly) {
        expect(
          capability.toolMetadata.every((tool) => (tool as { access: string }).access !== 'write'),
        ).toBe(true);
      }
    }
  });

  it('projects UI and telemetry metadata from the manifest', () => {
    expect(capabilityUiMetadata('canonical-chat')).toMatchObject({
      id: 'canonical-chat',
      route: 'canonical-chat',
      component: 'mastra-canonical-chat',
    });
    expect(capabilityTelemetryLabels('symbol-research')).toEqual({
      capabilityId: 'symbol-research',
      capabilityVersion: 'mode-2',
      capabilityRoute: 'symbol-research',
      capabilityScope: 'read-only',
    });
  });

  it('derives legacy routing tools from the canonical manifest', () => {
    expect(manifestToolsForDomain('technical')).toContain('get_price');
    expect(manifestToolsForDomain('technical')).toContain('compute_position_health');
  });

  it('declares the canonical capability as public read-only only', () => {
    expect(MASTRA_CAPABILITIES['canonical-chat']).toMatchObject({
      route: 'canonical-chat',
      component: 'mastra-canonical-chat',
      readOnly: true,
      // Phase 4 (roadmap Phase 5): 10 steps so iterative backtest workflows
      // (read knowledge → read skill → run v1 → iterate → save → explain) fit.
      maxSteps: 10,
    });
    expect(MASTRA_CAPABILITIES['canonical-chat'].tools).not.toContain('log_journal');
  });

  it('declares the shared symbol-research capability for every symbol', () => {
    expect(MASTRA_CAPABILITIES['symbol-research']).toMatchObject({
      id: 'symbol-research',
      allowedSymbols: expect.arrayContaining(['XAUUSD', 'EURUSD']),
      allowedModes: ['single', 'full'],
      readOnly: true,
      evidencePolicy: 'required',
      supportsAbort: true,
    });
  });

  // Audit plan §1.11 / P1-21 — the manifest ids must resolve to real
  // registrations, not phantom underscore names, so the manifest is
  // enforceable against actual tool registrations.
  it('lists the resolved native tool ids for the symbol-research manifest', () => {
    expect(MASTRA_CAPABILITIES['symbol-research'].tools).toEqual([
      'collect-symbol-research-packet',
      'get_seasonality',
      'get_cot',
      'get_intermarket_resonance',
      'web_search',
      'search_knowledge',
    ]);
  });

  it('fails loudly when a manifest declares a phantom tool id', () => {
    const doctored = {
      ...MASTRA_CAPABILITIES,
      'symbol-research': {
        ...MASTRA_CAPABILITIES['symbol-research'],
        // The pre-fix phantom id must no longer pass the integrity check.
        tools: [
          'collect-symbol-research-packet',
          'get_xauusd_seasonality',
          'get_cot',
          'get_intermarket_resonance',
          'web_search',
          'search_knowledge',
        ],
      },
    } as unknown as Record<string, MastraCapability>;
    expect(() => assertCapabilityManifestIntegrity(doctored)).toThrow(
      /does not resolve to any registered tool/,
    );
  });

  it('keeps every mutation tool out of the canonical read-only allowlist', () => {
    const mutationTools = ['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'];

    for (const mutationTool of mutationTools) {
      expect(MASTRA_CAPABILITIES['canonical-chat'].tools).not.toContain(mutationTool);
    }
  });

  it('makes every native read-only tool reachable through the allowlist and a capability', () => {
    // `get_system_diagnostics` is an operator-facing probe that deliberately
    // never ships in the chat tool belt; every other native read-only tool must
    // be both allowlisted and declared by at least one capability.
    const nonChatNativeTools = new Set(['get_system_diagnostics']);
    const capabilityTools = new Set<string>(
      Object.values(MASTRA_CAPABILITIES).flatMap((capability) => [...capability.tools]),
    );
    for (const name of Object.keys(nativeCanonicalTools())) {
      if (nonChatNativeTools.has(name)) continue;
      expect(READ_ONLY_TOOL_NAMES.has(name), `${name} missing from READ_ONLY_TOOL_NAMES`).toBe(
        true,
      );
      expect(capabilityTools.has(name), `${name} missing from MASTRA_CAPABILITIES`).toBe(true);
    }
  });

  it('keeps mutation workflows disabled and approval-gated', () => {
    expect(MASTRA_CAPABILITIES['mutation-workflows']).toMatchObject({
      readOnly: false,
      requiresConfirmation: true,
      tools: ['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'],
    });
    expect(
      evaluateMastraCapability({
        capabilityId: 'mutation-workflows',
        symbol: 'XAUUSD',
        mode: 'single',
        mutationRequested: true,
        confirmed: true,
      }),
    ).toMatchObject({ allowed: false, reason: 'mutations-disabled' });
  });

  it('resolves known capabilities and rejects unknown IDs', () => {
    expect(getMastraCapability('symbol-research')?.id).toBe('symbol-research');
    expect(getMastraCapability('not-a-capability')).toBeNull();
  });

  it('allows the shared symbol-research capability for XAUUSD single mode', () => {
    expect(
      evaluateMastraCapability({
        capabilityId: 'symbol-research',
        symbol: 'XAUUSD',
        mode: 'single',
      }),
    ).toMatchObject({ allowed: true });
  });

  it.each([
    ['unsupported symbol', { symbol: 'FAKESYMBOL', mode: 'single' as const }, 'unsupported-symbol'],
    [
      'explicit model override',
      { symbol: 'XAUUSD', mode: 'single' as const, hasModelOverride: true },
      'model-override',
    ],
    [
      'mutation request',
      { symbol: 'XAUUSD', mode: 'single' as const, mutationRequested: true },
      'mutation-request',
    ],
  ])('rejects %s before model execution', (_label, request, reason) => {
    expect(
      evaluateMastraCapability({
        capabilityId: 'symbol-research',
        ...request,
      }),
    ).toMatchObject({ allowed: false, reason });
  });

  it('rejects unknown capabilities closed by default', () => {
    expect(
      evaluateMastraCapability({
        capabilityId: 'unknown',
        symbol: 'XAUUSD',
        mode: 'single',
      }),
    ).toEqual({
      allowed: false,
      capability: null,
      reason: 'unknown-capability',
    });
  });
});
