import { describe, expect, it } from 'vitest';

import {
  capabilityDefinitionForRoute,
  decideMastraExecution,
  readOnlyToolsForRoutingDomain,
} from '../src/mastra';

const env = {} as never;

const settings = {
  aiApiKeys: null,
  chatModel: null,
} as never;

function message(text: string) {
  return {
    id: 'message-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text }],
  };
}

describe('Mastra execution decision facade', () => {
  it('selects canonical chat for an ordinary turn', async () => {
    const decision = await decideMastraExecution({
      userMessage: message('Explain risk management'),
      mode: 'single',
      settings,
      env,
    });

    expect(decision.route).toBe('canonical-chat');
    expect(decision.modelPurpose).toBe('canonical-chat');
    expect(decision.capability).toBeNull();
  });

  it('selects the durable route for Full mode', async () => {
    const decision = await decideMastraExecution({
      userMessage: message('Analyze XAUUSD deeply'),
      symbol: 'XAUUSD',
      mode: 'full',
      settings,
      env,
    });

    expect(decision.route).toBe('full-analysis-queue');
    expect(decision.modelPurpose).toBe('worker');
  });

  it('classifies mutation before selecting a research route', async () => {
    const decision = await decideMastraExecution({
      userMessage: message('Please place a trade and set an alert'),
      symbol: 'XAUUSD',
      mode: 'standard',
      settings,
      env,
    });

    expect(decision.route).toBe('mutation');
    expect(decision.capability).toMatchObject({
      allowed: false,
      capability: { id: 'mutation-workflows' },
    });
  });

  it('keeps domain tool lists read-only', () => {
    expect(readOnlyToolsForRoutingDomain('technical')).not.toContain('set_alert');
    expect(readOnlyToolsForRoutingDomain('fundamental')).not.toContain('log_journal');
  });

  it('maps route capabilities through one registry', () => {
    expect(capabilityDefinitionForRoute('xauusd-conversation')?.readOnly).toBe(true);
    expect(capabilityDefinitionForRoute('mutation')?.requiresConfirmation).toBe(true);
  });
});
