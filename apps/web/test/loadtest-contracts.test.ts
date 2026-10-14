import { describe, expect, it } from 'vitest';

import { generateJunitXml } from '../../../loadtest/lib/summary.js';

describe('k6 loadtest summary & JUnit contract', () => {
  it('flags threshold breaches on any metric, not just http_req_failed', () => {
    const xml = generateJunitXml(
      {
        metrics: {
          http_req_failed: { thresholds: { 'rate<0.01': { ok: true } } },
          'http_req_duration{group:market_read}': {
            thresholds: { 'p(95)<500': { ok: false } },
          },
        },
        root_group: {
          checks: [{ name: 'status is 2xx', passes: 100, fails: 0 }],
        },
      },
      'load-market-read',
      '2026-10-14T12-00-00Z',
    );
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('http_req_duration{group:market_read}: p(95)&lt;500');
  });

  it('treats numeric check.passes/fails as counts rather than booleans', () => {
    const cleanXml = generateJunitXml(
      {
        metrics: {},
        root_group: {
          checks: [{ name: 'status is 2xx', passes: 250, fails: 0 }],
        },
      },
      'smoke-read-mix',
      '2026-10-14T12-00-00Z',
    );
    expect(cleanXml).toContain('failures="0"');

    const failedCheckXml = generateJunitXml(
      {
        metrics: {},
        root_group: {
          checks: [{ name: 'status is 2xx', passes: 249, fails: 1 }],
        },
      },
      'smoke-read-mix',
      '2026-10-14T12-00-00Z',
    );
    expect(failedCheckXml).toContain('failures="1"');
    expect(failedCheckXml).toContain('check failed: status is 2xx (1 failed / 249 passed)');
  });
});
