import { formatTextSummary } from './utils.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function handleSummary(data: Record<string, unknown>): Record<string, string> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rootGroup = (data.root_group ?? {}) as { name?: string };
  const testName = rootGroup.name || 'k6-loadtest';

  const jsonPath = `results/${testName}-${ts}.summary.json`;
  const junitPath = `results/${testName}-${ts}.junit.xml`;

  return {
    stdout: formatTextSummary(data) + '\n',
    [jsonPath]: JSON.stringify(data, null, 2),
    [junitPath]: generateJunitXml(data, testName, ts),
  };
}

export function generateJunitXml(
  data: Record<string, unknown>,
  testName: string,
  ts: string,
): string {
  const metrics = (data.metrics ?? {}) as Record<
    string,
    { thresholds?: Record<string, { ok?: boolean }> }
  >;
  const failures: string[] = [];
  let totalCases = 0;

  for (const [metricName, metric] of Object.entries(metrics)) {
    const thresholds = metric.thresholds ?? {};
    for (const [thName, th] of Object.entries(thresholds)) {
      totalCases += 1;
      if (th.ok === false) {
        failures.push(`threshold breached: ${metricName}: ${thName}`);
      }
    }
  }

  const rootGroup = (data.root_group ?? {}) as {
    checks?: Array<{ name: string; passes?: number; fails?: number }>;
  };
  const checks = Array.isArray(rootGroup.checks) ? rootGroup.checks : [];
  for (const c of checks) {
    totalCases += 1;
    const fails = Number(c.fails ?? 0);
    const passes = Number(c.passes ?? 0);
    if (fails > 0) {
      failures.push(`check failed: ${c.name} (${fails} failed / ${passes} passed)`);
    }
  }

  const tests = Math.max(totalCases, 1);
  const failed = failures.length;

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${escapeXml(testName)}" tests="${tests}" failures="${failed}" timestamp="${escapeXml(ts)}">
  <testsuite name="${escapeXml(testName)}" tests="${tests}" failures="${failed}">
    ${failures
      .map((f) => {
        const escaped = escapeXml(f);
        return `<testcase name="${escaped}"><failure message="${escaped}"/></testcase>`;
      })
      .join('\n    ')}
  </testsuite>
</testsuites>`;
}
