import { describe, expect, it } from 'vitest';

import { createExecutionPlan, parseExecutionPlan, serializeExecutionPlan } from '../src/mastra-v2';

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
      // B-03 (audit 2026-10-18): the policy now derives from the canonical-chat
      // manifest capability — no synthesized fallback policy literal.
      capabilityId: 'canonical-chat',
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
      mode: 'full',
      settings,
      env,
    });

    expect(plan.route).toBe('mutation-draft');
    expect(plan.mutationRequested).toBe(true);
    expect(plan.memoryPolicy.mode).toBe('disabled');
    expect(plan.streaming).toBe(false);
  });

  it('creates a bounded comparison plan for a two-symbol prompt (A-01)', async () => {
    const plan = await createExecutionPlan({
      userMessage: message('Compare XAUUSD and EURUSD'),
      mode: 'single',
      // Comparison runs resolve the one-desk model; provide a credential so
      // model resolution can complete.
      settings: { aiApiKeys: null, chatModel: 'google:gemini-2.5-flash' } as never,
      env: { GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' } as never,
    });

    expect(plan.route).toBe('multi-symbol-research');
    expect(plan.symbols).toEqual(['XAUUSD', 'EURUSD']);
    expect(plan.capabilityId).toBe('symbol-research');
    expect(plan.evidencePolicy.required).toBe(true);
    // Serialized comparison plans round-trip with their symbol list intact.
    expect(parseExecutionPlan(serializeExecutionPlan(plan)).symbols).toEqual(['XAUUSD', 'EURUSD']);
  });

  it('derives steps, duration, and recall from the active capability manifest (B-04)', async () => {
    // An explicit capability override must flow straight from the manifest —
    // the removed fallback literal hardcoded canonical-chat:6 / other:1 and
    // silently ignored manifest values like these.
    const plan = await createExecutionPlan({
      userMessage: message('Show my journal stats'),
      mode: 'single',
      capabilityId: 'sensitive-user-read',
      settings,
      env,
    });

    expect(plan.capabilityId).toBe('sensitive-user-read');
    expect(plan.maxSteps).toBe(3);
    expect(plan.maxDurationMs).toBe(55_000);
    // sensitive-user-read opts out of cross-thread semantic recall.
    expect(plan.memoryPolicy.semanticRecall).toBe(false);
  });

  it('round-trips through strict serialization', async () => {
    const plan = await createExecutionPlan({
      userMessage: message('Analyze EURUSD'),
      symbol: 'EURUSD',
      mode: 'full',
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
