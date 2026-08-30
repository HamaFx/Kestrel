import { describe, expect, it } from 'vitest';

import { CAPABILITY_REGISTRY, isReadOnlyCapability, toolsForCapability } from '../src/mastra';

describe('capability registry', () => {
  it('shares the reviewed capability definitions', () => {
    expect(CAPABILITY_REGISTRY['xauusd-conversation'].readOnly).toBe(true);
    expect(isReadOnlyCapability('mutation-workflows')).toBe(false);
    expect(toolsForCapability('xauusd-conversation')).toContain('search-untrusted-web');
  });
});
