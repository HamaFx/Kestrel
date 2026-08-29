import { describe, expect, it } from 'vitest';

import { isSafeOutboundHttpUrl } from '../src/url-safety';

describe('outbound URL safety', () => {
  it('allows ordinary HTTP(S) URLs', () => {
    expect(isSafeOutboundHttpUrl('https://example.com/path')).toBe(true);
    expect(isSafeOutboundHttpUrl('http://example.com/path')).toBe(true);
  });

  it('rejects local and private network targets', () => {
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1:8080',
      'http://10.0.0.1',
      'http://172.16.0.1',
      'http://192.168.1.1',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://metadata.google.internal/',
    ]) {
      expect(isSafeOutboundHttpUrl(url), url).toBe(false);
    }
  });

  it('rejects credentials and non-HTTP protocols', () => {
    expect(isSafeOutboundHttpUrl('https://user:pass@example.com')).toBe(false);
    expect(isSafeOutboundHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeOutboundHttpUrl('ftp://example.com/file')).toBe(false);
    expect(isSafeOutboundHttpUrl('not a URL')).toBe(false);
  });
});
