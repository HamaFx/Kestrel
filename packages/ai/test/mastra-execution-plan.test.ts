import { describe, expect, it } from 'vitest';

import { createExecutionPlan, parseExecutionPlan, serializeExecutionPlan } from '../src/mastra';

const settings = { aiApiKeys: null, chatModel: null } as never;
const env = {} as never;

function message(text: string) {
  return {
    id: 'message-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text }],
  };
}

describe('Phase 2 execution plan', () => {
  it('creates a canonical plan with explicit policies and limits', async () => {
    const plan = await createExecutionPlan({
      userMessage: message('Explain risk management'),
      mode: 'single',
      settings,
      env,
      tenantId: 'tenant-1',
    });

    expect(plan).toMatchObject({
      version: 1,
      route: 'canonical-chat',
      capabilityId: null,
      symbol: null,
      mode: 'single',
      streaming: true,
      mutationRequested: false,
      tenantId: 'tenant-1',
      memoryPolicy: { mode: 'native', required: true, scope: 'user-thread' },
    });
    expect(plan.maxSteps).toBeGreaterThan(0);
    expect(plan.maxDurationMs).toBeGreaterThan(0);
    expect(plan.toolPolicy.readOnly).toBe(true);
  });

  it('creates a strict Full research plan from one decision', async () => {
    const plan = await createExecutionPlan({
      userMessage: message('Analyze EURUSD deeply'),
      symbol: 'EURUSD',
      mode: 'full',
      settings,
      env,
    });

    expect(plan.route).toBe('full-analysis');
    expect(plan.capabilityId).toBe('symbol-research');
    expect(plan.evidencePolicy.required).toBe(true);
    expect(plan.streaming).toBe(false);
    expect(plan.toolPolicy.tools).toContain('collect-symbol-research-packet');
  });

  it('classifies mutation before producing the route', async () => {
    const plan = await createExecutionPlan({
      userMessage: message('Please place a trade and set an alert'),
      symbol: 'XAUUSD',
      mode: 'standard',
      settings,
      env,
    });

    expect(plan.route).toBe('mutation-draft');
    expect(plan.mutationRequested).toBe(true);
    expect(plan.memoryPolicy.mode).toBe('disabled');
    expect(plan.streaming).toBe(false);
  });

  it('round-trips through strict serialization', async () => {
    const plan = await createExecutionPlan({
      userMessage: message('Analyze EURUSD'),
      symbol: 'EURUSD',
      mode: 'standard',
      modelOverride: 'google:gemini-2.5-flash',
      // The planner contract test only exercises serialization; provide the
      // matching provider credential so model resolution can complete.
      settings: { aiApiKeys: null, chatModel: 'google:gemini-2.5-flash' } as never,
      env: { GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' } as never,
    });

    expect(parseExecutionPlan(serializeExecutionPlan(plan))).toEqual(plan);
    expect(() => parseExecutionPlan({ ...plan, route: 'unknown' })).toThrow();
  });
});
