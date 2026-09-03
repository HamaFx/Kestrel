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
} from '../src/mastra';

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
    expect(capabilityTelemetryLabels('xauusd-conversation')).toEqual({
      capabilityId: 'xauusd-conversation',
      capabilityVersion: 'poc-5',
      capabilityRoute: 'xauusd-conversation',
      capabilityScope: 'read-only',
    });
  });

  it('derives legacy routing tools from the canonical manifest', () => {
    expect(manifestToolsForDomain('technical')).toContain('get_price');
    expect(manifestToolsForDomain('technical')).toContain('get_portfolio_snapshot');
  });

  it('declares the canonical capability as public read-only only', () => {
    expect(MASTRA_CAPABILITIES['canonical-chat']).toMatchObject({
      route: 'canonical-chat',
      component: 'mastra-canonical-chat',
      readOnly: true,
      maxSteps: 6,
    });
    expect(MASTRA_CAPABILITIES['canonical-chat'].tools).not.toContain('get_portfolio_snapshot');
    expect(MASTRA_CAPABILITIES['canonical-chat'].tools).not.toContain('log_journal');
  });

  it('declares the current XAUUSD research capability explicitly', () => {
    expect(MASTRA_CAPABILITIES['xauusd-research']).toMatchObject({
      id: 'xauusd-research',
      allowedSymbols: ['XAUUSD'],
      allowedModes: ['single', 'auto'],
      readOnly: true,
      evidencePolicy: 'required',
      supportsAbort: true,
    });
  });

  it('keeps every mutation tool out of the canonical read-only allowlist', () => {
    const mutationTools = ['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'];

    for (const mutationTool of mutationTools) {
      expect(MASTRA_CAPABILITIES['canonical-chat'].tools).not.toContain(mutationTool);
    }
  });

  it('declares the conversational narrow-tool allowlist and step budget', () => {
    expect(MASTRA_CAPABILITIES['xauusd-conversation']).toMatchObject({
      tools: [
        'get-xauusd-market-structure',
        'get-xauusd-session-levels',
        'analyze-xauusd-technical',
        'get-xauusd-correlation',
        'get-xauusd-intermarket',
        'forecast-xauusd-volatility',
        'get-xauusd-news',
        'get-xauusd-calendar',
        'get-xauusd-social-sentiment',
        'get-xauusd-fundamental-context',
        'get-xauusd-seasonality',
        'get-xauusd-cot',
        'get-xauusd-intermarket-resonance',
        'search-untrusted-web',
        'search-untrusted-knowledge',
      ],
      maxSteps: 3,
      readOnly: true,
    });
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
    expect(getMastraCapability('xauusd-research')?.id).toBe('xauusd-research');
    expect(getMastraCapability('not-a-capability')).toBeNull();
  });

  it('allows the current read-only XAUUSD Single capability', () => {
    expect(
      evaluateMastraCapability({
        capabilityId: 'xauusd-research',
        symbol: 'XAUUSD',
        mode: 'single',
      }),
    ).toMatchObject({ allowed: true });
  });

  it.each([
    ['unsupported symbol', { symbol: 'EURUSD', mode: 'single' as const }, 'unsupported-symbol'],
    ['unsupported mode', { symbol: 'XAUUSD', mode: 'standard' as const }, 'unsupported-mode'],
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
        capabilityId: 'xauusd-research',
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
