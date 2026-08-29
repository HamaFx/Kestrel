import { describe, expect, it } from 'vitest';

import { isAllowedWebSearchProviderUrl } from '../src/tools/web-search';

describe('web search provider URL safety', () => {
  it('allows only the configured HTTPS provider hosts', () => {
    expect(isAllowedWebSearchProviderUrl('https://api.exa.ai/search')).toBe(true);
    expect(isAllowedWebSearchProviderUrl('https://api.tavily.com/search')).toBe(true);
    expect(isAllowedWebSearchProviderUrl('https://api.search.brave.com/res/v1/web/search')).toBe(
      true,
    );
  });

  it('rejects non-HTTPS and untrusted hosts', () => {
    expect(isAllowedWebSearchProviderUrl('http://api.exa.ai/search')).toBe(false);
    expect(isAllowedWebSearchProviderUrl('https://example.com/search')).toBe(false);
    expect(isAllowedWebSearchProviderUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedWebSearchProviderUrl('https://api.exa.ai@evil.example/search')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedWebSearchProviderUrl('not a URL')).toBe(false);
    expect(isAllowedWebSearchProviderUrl('')).toBe(false);
  });
});
