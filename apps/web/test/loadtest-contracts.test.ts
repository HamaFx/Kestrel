import { describe, expect, it, vi } from 'vitest';

vi.mock('k6', () => ({
  check: vi.fn(),
}));

vi.mock('k6/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    cookieJar: vi.fn(() => ({ clear: vi.fn(), set: vi.fn() })),
  },
}));

vi.mock('k6/metrics', () => ({
  Counter: class { add() {} },
  Rate: class { add() {} },
  Trend: class { add() {} },
  Gauge: class { add() {} },
}));

import { parseSseBody } from '../../../loadtest/lib/sse.js';
import { generateJunitXml } from '../../../loadtest/lib/summary.js';
import { compareSummaries } from '../../../loadtest/scripts/compare-baseline.mjs';

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

describe('SSE stream parser & baseline regression comparator', () => {
  it('parses Kestrel SSE frames and detects terminal turn-complete / text-end events', () => {
    const raw = [
      'data: {"type":"text-start","id":"msg-1"}',
      '',
      'data: {"type":"text-delta","id":"msg-1","delta":"Gold is bullish"}',
      '',
      'data: {"type":"text-end","id":"msg-1"}',
      '',
    ].join('\n');

    const res = parseSseBody(raw);
    expect(res.eventCount).toBe(3);
    expect(res.hasTerminalEvent).toBe(true);
    expect(res.byteLength).toBe(raw.length);
  });

  it('flags p95 regressions exceeding threshold percentage', () => {
    const base = {
      metrics: {
        'http_req_duration{group:market_read}': { values: { 'p(95)': 200, 'p(99)': 400 } },
      },
    };
    const candPass = {
      metrics: {
        'http_req_duration{group:market_read}': { values: { 'p(95)': 215, 'p(99)': 420 } },
      },
    };
    const candFail = {
      metrics: {
        'http_req_duration{group:market_read}': { values: { 'p(95)': 260, 'p(99)': 420 } },
      },
    };

    expect(compareSummaries(base, candPass, { maxP95RegressionPct: 15 }).ok).toBe(true);
    const failed = compareSummaries(base, candFail, { maxP95RegressionPct: 15 });
    expect(failed.ok).toBe(false);
    expect(failed.regressions[0]).toContain('http_req_duration{group:market_read} p(95)');
  });
});
