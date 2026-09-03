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

// Phase 0 — route decision matrix. One planner (Phase 2) decides the route
// from (mode, symbol, mutation) inputs; downstream services must not
// reclassify. This table pins every supported combination.

import { describe, expect, it } from 'vitest';

import { createExecutionPlan } from '../src/mastra';
import type { MastraCapabilityId } from '../src/mastra/capabilities';
import { ExecutionRouteSchema, type ExecutionPlan } from '../src/mastra/execution-plan';

const modelOverride = 'google:gemini-2.5-flash' as const;

/** Settings + env required to resolve a concrete model snapshot. */
const resolvedCredentialContext = {
  settings: { aiApiKeys: null, chatModel: modelOverride },
  env: { GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' },
} as const;

function message(text: string) {
  return {
    id: 'message-1',
    role: 'user' as const,
    content: text,
    parts: [{ type: 'text' as const, text }],
  };
}

interface MatrixCell {
  name: string;
  mode: 'single' | 'quick' | 'standard' | 'full' | 'auto';
  prompt: string;
  symbol?: string | null;
  capabilityId?: MastraCapabilityId;
  credentials?: boolean;
  expected: {
    route: ExecutionPlan['route'];
    capabilityId: string | null;
    streaming: boolean;
    readOnly: boolean;
    memoryMode: 'native' | 'disabled';
    memoryRequired: boolean;
    symbol: string | null;
    bareModelId: string | null;
  };
}

const ROUTE_MATRIX: MatrixCell[] = [
  {
    name: 'single XAUUSD research',
    mode: 'single',
    prompt: 'Analyze XAUUSD',
    credentials: true,
    expected: {
      route: 'xauusd-research',
      capabilityId: 'xauusd-research',
      // Verified reports stay buffered until the report verifier completes.
      streaming: false,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: 'XAUUSD',
      bareModelId: 'gemini-2.5-flash',
    },
  },
  {
    name: 'auto XAUUSD research',
    mode: 'auto',
    prompt: 'Analyze XAUUSD',
    credentials: true,
    expected: {
      route: 'xauusd-research',
      capabilityId: 'xauusd-research',
      streaming: false,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: 'XAUUSD',
      bareModelId: 'gemini-2.5-flash',
    },
  },
  {
    name: 'single XAUUSD conversation',
    mode: 'single',
    prompt: 'What is the current gold price?',
    credentials: true,
    expected: {
      route: 'xauusd-conversation',
      capabilityId: 'xauusd-conversation',
      streaming: true,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: 'XAUUSD',
      bareModelId: 'gemini-2.5-flash',
    },
  },
  {
    name: 'single symbol-free canonical chat',
    mode: 'single',
    prompt: 'Explain how RSI works',
    expected: {
      route: 'canonical-chat',
      capabilityId: null,
      streaming: true,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: null,
      bareModelId: null,
    },
  },
  {
    name: 'auto non-XAUUSD canonical chat',
    mode: 'auto',
    prompt: 'Analyze EURUSD structure',
    expected: {
      route: 'canonical-chat',
      capabilityId: null,
      streaming: true,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: 'EURUSD',
      bareModelId: null,
    },
  },
  {
    name: 'quick symbol research',
    mode: 'quick',
    prompt: 'Analyze XAUUSD',
    credentials: true,
    expected: {
      route: 'symbol-research',
      capabilityId: 'symbol-research',
      streaming: false,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: 'XAUUSD',
      bareModelId: 'gemini-2.5-flash',
    },
  },
  {
    name: 'standard symbol research',
    mode: 'standard',
    prompt: 'Analyze EURUSD structure',
    credentials: true,
    expected: {
      route: 'symbol-research',
      capabilityId: 'symbol-research',
      streaming: false,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: 'EURUSD',
      bareModelId: 'gemini-2.5-flash',
    },
  },
  {
    name: 'full durable analysis',
    mode: 'full',
    prompt: 'Analyze EURUSD deeply',
    expected: {
      route: 'full-analysis',
      capabilityId: 'symbol-research',
      streaming: false,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: 'EURUSD',
      bareModelId: null,
    },
  },
  {
    name: 'mutation draft',
    mode: 'single',
    prompt: 'Please place a trade and set an alert',
    expected: {
      route: 'mutation-draft',
      capabilityId: 'mutation-workflows',
      streaming: false,
      readOnly: false,
      memoryMode: 'disabled',
      memoryRequired: false,
      symbol: null,
      bareModelId: null,
    },
  },
  {
    name: 'explicit XAUUSD research capability (verified report)',
    mode: 'single',
    prompt: 'Analyze XAUUSD',
    capabilityId: 'xauusd-research',
    credentials: true,
    expected: {
      route: 'xauusd-research',
      capabilityId: 'xauusd-research',
      streaming: false,
      readOnly: true,
      memoryMode: 'native',
      memoryRequired: true,
      symbol: 'XAUUSD',
      bareModelId: 'gemini-2.5-flash',
    },
  },
];

describe('Phase 0 route decision matrix', () => {
  it.each(ROUTE_MATRIX.map((cell) => [cell.name, cell] as const))(
    '%s → %s',
    async (_name, cell) => {
      const context = cell.credentials
        ? resolvedCredentialContext
        : { settings: { aiApiKeys: null, chatModel: null }, env: {} };
      const plan = await createExecutionPlan({
        userMessage: message(cell.prompt),
        mode: cell.mode,
        ...(cell.symbol !== undefined ? { symbol: cell.symbol } : {}),
        ...(cell.capabilityId ? { capabilityId: cell.capabilityId } : {}),
        ...(cell.credentials ? { modelOverride } : {}),
        ...context,
      });

      expect(plan.route).toBe(cell.expected.route);
      expect(plan.capabilityId).toBe(cell.expected.capabilityId);
      expect(plan.streaming).toBe(cell.expected.streaming);
      expect(plan.toolPolicy.readOnly).toBe(cell.expected.readOnly);
      expect(plan.memoryPolicy).toMatchObject({
        mode: cell.expected.memoryMode,
        required: cell.expected.memoryRequired,
      });
      expect(plan.symbol).toBe(cell.expected.symbol);
      expect(plan.model?.bareModelId ?? null).toBe(cell.expected.bareModelId);
    },
  );

  it('covers every planner route in the matrix', () => {
    const matrixRoutes = new Set(ROUTE_MATRIX.map((cell) => cell.expected.route));
    expect([...matrixRoutes].sort()).toEqual([...ExecutionRouteSchema.options].sort());
  });

  it('keeps mutation capability confirmation-gated and read-only routes read-only', async () => {
    for (const cell of ROUTE_MATRIX) {
      const context = cell.credentials
        ? resolvedCredentialContext
        : { settings: { aiApiKeys: null, chatModel: null }, env: {} };
      const plan = await createExecutionPlan({
        userMessage: message(cell.prompt),
        mode: cell.mode,
        ...(cell.symbol !== undefined ? { symbol: cell.symbol } : {}),
        ...(cell.capabilityId ? { capabilityId: cell.capabilityId } : {}),
        ...(cell.credentials ? { modelOverride } : {}),
        ...context,
      });
      if (plan.route === 'mutation-draft') {
        expect(plan.toolPolicy.requiresConfirmation).toBe(true);
        expect(plan.mutationRequested).toBe(true);
      } else {
        expect(plan.toolPolicy.requiresConfirmation).toBe(false);
      }
    }
  });
});
