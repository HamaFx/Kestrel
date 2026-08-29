import { describe, expect, it } from 'vitest';

import { isSafeOutboundUrl } from '../src/safe-url';

describe('safe outbound URLs', () => {
  it('allows public HTTPS hosts', () => {
    expect(isSafeOutboundUrl('https://example.com/path')).toBe(true);
  });

  it('rejects non-HTTPS and credential-bearing URLs', () => {
    expect(isSafeOutboundUrl('http://example.com')).toBe(false);
    expect(isSafeOutboundUrl('https://user:pass@example.com')).toBe(false);
  });

  it('rejects private, loopback, link-local, and metadata addresses', () => {
    for (const host of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', 'localhost', '[::1]', '[fd00::1]']) {
      expect(isSafeOutboundUrl(`https://${host}/`)).toBe(false);
    }
  });

  it('supports an explicit host allowlist', () => {
    expect(isSafeOutboundUrl('https://api.example.com', { hosts: ['api.example.com'] })).toBe(true);
    expect(isSafeOutboundUrl('https://other.example.com', { hosts: ['api.example.com'] })).toBe(false);
  });
});
