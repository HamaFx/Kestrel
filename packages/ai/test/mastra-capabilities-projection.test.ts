import { describe, expect, it } from 'vitest';

import { manifestToolNames, manifestToolsForDomain, MASTRA_CAPABILITIES } from '../src/mastra';

describe('capability manifest projections', () => {
  it('shares the reviewed capability definitions', () => {
    expect(MASTRA_CAPABILITIES['canonical-chat'].route).toBe('canonical-chat');
    expect(MASTRA_CAPABILITIES['xauusd-conversation'].readOnly).toBe(true);
    expect(MASTRA_CAPABILITIES['mutation-workflows'].readOnly).toBe(false);
    expect(manifestToolNames('xauusd-conversation')).toContain('search-untrusted-web');
  });

  it('keeps legacy domain policy explicit and mutation-free', () => {
    for (const domain of ['summary', 'vision', 'fundamental', 'technical'] as const) {
      expect(manifestToolsForDomain(domain)).not.toContain('set_alert');
      expect(manifestToolsForDomain(domain)).not.toContain('run_system_action');
    }
  });
});
