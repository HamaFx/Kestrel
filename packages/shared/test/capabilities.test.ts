import { describe, expect, it } from 'vitest';

import { getCapabilityReport } from '../src/capabilities';

describe('capability report', () => {
  it('reports optional integrations without exposing credential values', () => {
    const report = getCapabilityReport({
      DATABASE_URL: 'postgres://secret-user:secret-password@localhost/db',
      AI_GATEWAY_API_KEY: 'secret-api-key',
      FINNHUB_API_KEY: 'finnhub-secret',
      SENTRY_DSN: 'https://secret@sentry.example/1',
      LANGFUSE_PUBLIC_KEY: 'public',
      LANGFUSE_SECRET_KEY: 'secret',
      LANGFUSE_BASE_URL: 'https://langfuse.example',
      LANGFUSE_RECORD_IO: '0',
    });

    expect(report.enabled).toEqual(
      expect.arrayContaining(['database', 'ai-server-fallback', 'finnhub', 'sentry', 'langfuse']),
    );
    expect(report.disabled).toEqual(expect.arrayContaining(['telegram', 'email', 'billing']));
    expect(JSON.stringify(report)).not.toContain('secret-password');
    expect(JSON.stringify(report)).not.toContain('secret-api-key');
    expect(JSON.stringify(report)).not.toContain('finnhub-secret');
  });

  it('reports the privacy-preserving Langfuse default', () => {
    const report = getCapabilityReport({
      LANGFUSE_PUBLIC_KEY: 'public',
      LANGFUSE_SECRET_KEY: 'secret',
      LANGFUSE_BASE_URL: 'https://langfuse.example',
    });

    const capture = report.capabilities.find(
      (capability) => capability.name === 'langfuse-prompt-output-capture',
    );
    expect(capture).toMatchObject({ status: 'disabled' });
  });
});
