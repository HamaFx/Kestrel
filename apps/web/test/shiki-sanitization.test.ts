import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sanitizeShikiHtml } from '../src/components/chat/parts/text';

describe('sanitizeShikiHtml', () => {
  beforeEach(() => {
    // DOMPurify uses the test environment's parser when window is available.
    if (typeof window === 'undefined') vi.stubGlobal('window', globalThis);
  });

  it('keeps Shiki markup and removes active content', () => {
    const result = sanitizeShikiHtml(
      '<pre class="shiki" style="color:red" tabindex="0"><code><span class="token">safe</span></code></pre>' +
        '<script>alert(1)</script><img src=x onerror=alert(2)>' +
        '<svg onload=alert(3)></svg>',
    );

    expect(result).toContain('<pre');
    expect(result).toContain('class="shiki"');
    expect(result).toContain('safe');
    expect(result).not.toMatch(/script|onerror|onload|<img|<svg/i);
  });

  it('removes dangerous attributes while retaining allowed token styles', () => {
    const result = sanitizeShikiHtml(
      '<pre onclick="alert(1)" data-x="bad"><code><span style="color: red" onmouseover="alert(2)">x</span></code></pre>',
    );

    expect(result).toContain('style="color: red"');
    expect(result).not.toMatch(/onclick|onmouseover/i);
    expect(result).not.toContain('data-x=');
  });

  it('returns no HTML when called without a DOM', () => {
    const previousWindow = globalThis.window;
    // @ts-expect-error test-only removal of the browser global
    delete globalThis.window;
    try {
      expect(sanitizeShikiHtml('<script>alert(1)</script>')).toBe('');
    } finally {
      globalThis.window = previousWindow;
    }
  });
});
