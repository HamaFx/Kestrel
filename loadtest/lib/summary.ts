/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Shared handleSummary that every test file re-exports.
// Produces:
//   - results/<testname>-<timestamp>.summary.json  (machine-readable)
//   - results/<testname>-<timestamp>.junit.xml     (CI test reporting)
//   - stdout text summary (k6 default)

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any): Record<string, string> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const testName = data.root_group?.name ?? 'unknown';

  // JSON summary — full k6 output for archival / baseline comparison
  const jsonPath = `results/${testName}-${ts}.summary.json`;

  // JUnit XML for CI test reporting (GitHub Actions annotations)
  const junitXml = generateJunitXml(data, testName, ts);
  const junitPath = `results/${testName}-${ts}.junit.xml`;

  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }) + '\n',
    [jsonPath]: JSON.stringify(data, null, 2),
    [junitPath]: junitXml,
  };
}

function generateJunitXml(data: Record<string, unknown>, testName: string, ts: string): string {
  const metrics = (data.metrics ?? {}) as Record<
    string,
    { thresholds?: Record<string, { ok?: boolean }> }
  >;
  const failures: string[] = [];

  // Check threshold breaches
  const thresholds = metrics['http_req_failed']?.thresholds ?? {};
  for (const [name, th] of Object.entries(thresholds)) {
    if ((th as { ok?: boolean }).ok === false) {
      failures.push(`threshold breached: ${name}`);
    }
  }

  // Check check failures
  const rootGroup = (data.root_group ?? {}) as {
    checks?: { passes: boolean; fails: number; name: string }[];
  };
  const checks = rootGroup.checks ?? [];
  const checksFailed = checks.filter((c: { passes: boolean }) => !c.passes).length;

  const tests = checks.length;
  const failed = checksFailed + (failures.length > 0 ? 1 : 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="${testName}" tests="${tests}" failures="${failed}" timestamp="${ts}">
  <testsuite name="${testName}" tests="${tests}" failures="${failed}">
    ${failures.map((f) => `<testcase name="${f}"><failure message="${f}"/></testcase>`).join('\n    ')}
  </testsuite>
</testsuites>`;
}
