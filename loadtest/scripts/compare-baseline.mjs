#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function compareSummaries(baseline, candidate, opts = {}) {
  const maxP95Pct = opts.maxP95RegressionPct ?? 20;
  const maxP99Pct = opts.maxP99RegressionPct ?? 30;
  const regressions = [];

  const baseMetrics = baseline?.metrics ?? {};
  const candMetrics = candidate?.metrics ?? {};

  for (const [metricKey, baseMetric] of Object.entries(baseMetrics)) {
    const candMetric = candMetrics[metricKey];
    if (!candMetric) continue;

    const baseValues = baseMetric.values ?? {};
    const candValues = candMetric.values ?? {};

    const baseP95 = baseValues['p(95)'];
    const candP95 = candValues['p(95)'];
    if (typeof baseP95 === 'number' && typeof candP95 === 'number' && baseP95 > 0) {
      const p95DiffPct = ((candP95 - baseP95) / baseP95) * 100;
      if (p95DiffPct > maxP95Pct) {
        regressions.push(
          `${metricKey} p(95) regressed by ${p95DiffPct.toFixed(1)}% (${baseP95.toFixed(1)}ms -> ${candP95.toFixed(1)}ms, max allowed: ${maxP95Pct}%)`,
        );
      }
    }

    const baseP99 = baseValues['p(99)'];
    const candP99 = candValues['p(99)'];
    if (typeof baseP99 === 'number' && typeof candP99 === 'number' && baseP99 > 0) {
      const p99DiffPct = ((candP99 - baseP99) / baseP99) * 100;
      if (p99DiffPct > maxP99Pct) {
        regressions.push(
          `${metricKey} p(99) regressed by ${p99DiffPct.toFixed(1)}% (${baseP99.toFixed(1)}ms -> ${candP99.toFixed(1)}ms, max allowed: ${maxP99Pct}%)`,
        );
      }
    }
  }

  return {
    ok: regressions.length === 0,
    regressions,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node compare-baseline.mjs <baseline.json> <candidate.json>');
    process.exit(1);
  }
  const base = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const cand = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  const result = compareSummaries(base, cand);
  if (!result.ok) {
    console.error('❌ Baseline regression detected:');
    for (const r of result.regressions) {
      console.error(`  - ${r}`);
    }
    process.exit(1);
  } else {
    console.log('✅ No regressions detected against baseline.');
  }
}
