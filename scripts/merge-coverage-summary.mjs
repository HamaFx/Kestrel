#!/usr/bin/env node
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

// Merges the per-workspace Vitest coverage output (istanbul
// `coverage-final.json`, produced by the default `json` reporter) into a
// single repo-root `coverage/coverage-summary.json` — the file the
// vitest-coverage-report-action hard-requires at its default path.
//
// Why this exists: the workspace Vitest configs deliberately keep Vitest's
// default reporters (no `json-summary` reporter), so without this merge the
// CI "Report Coverage" step fails whenever the tests pass. Deriving the
// summary from the existing `json` output avoids re-running coverage.
//
// Usage: node scripts/merge-coverage-summary.mjs

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} dir
 * @returns {string[]} absolute workspace directories under apps/ and packages/
 */
function workspaceDirs(dir) {
  const base = path.join(root, dir);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(base, e.name))
    .filter((p) => existsSync(path.join(p, 'coverage', 'coverage-final.json')));
}

function emptyMetric() {
  return { total: 0, covered: 0, skipped: 0 };
}

function pct(metric) {
  return metric.total === 0 ? 100 : Math.round((metric.covered / metric.total) * 10000) / 100;
}

/**
 * Convert one istanbul file-coverage entry into istanbul summary metrics.
 * @param {Record<string, any>} fileCoverage
 */
function summarizeFile(fileCoverage) {
  const statements = emptyMetric();
  const branches = emptyMetric();
  const functions = emptyMetric();
  const lines = emptyMetric();
  const lineCovered = new Map();

  for (const key of Object.keys(fileCoverage.statementMap ?? {})) {
    const count = fileCoverage.s?.[key] ?? 0;
    statements.total += 1;
    if (count > 0) statements.covered += 1;
    const line = fileCoverage.statementMap[key]?.start?.line;
    if (typeof line === 'number') {
      lineCovered.set(line, (lineCovered.get(line) ?? 0) + (count > 0 ? 1 : 0));
    }
  }
  for (const key of Object.keys(fileCoverage.branchMap ?? {})) {
    const counts = fileCoverage.b?.[key] ?? [];
    for (const count of counts) {
      branches.total += 1;
      if (count > 0) branches.covered += 1;
    }
  }
  for (const key of Object.keys(fileCoverage.fnMap ?? {})) {
    const count = fileCoverage.f?.[key] ?? 0;
    functions.total += 1;
    if (count > 0) functions.covered += 1;
  }
  for (const covered of lineCovered.values()) {
    lines.total += 1;
    if (covered > 0) lines.covered += 1;
  }

  const metric = (m) => ({ total: m.total, covered: m.covered, skipped: m.skipped, pct: pct(m) });
  return {
    lines: metric(lines),
    statements: metric(statements),
    functions: metric(functions),
    branches: metric(branches),
  };
}

const summary = {
  total: { lines: emptyMetric(), statements: emptyMetric(), functions: emptyMetric(), branches: emptyMetric() },
};
const mergedFinal = {};
let fileCount = 0;

for (const workspace of [...workspaceDirs('apps'), ...workspaceDirs('packages')]) {
  const finalPath = path.join(workspace, 'coverage', 'coverage-final.json');
  let raw;
  try {
    raw = JSON.parse(readFileSync(finalPath, 'utf8'));
  } catch (err) {
    console.error(`warning: cannot parse ${finalPath}: ${String(err)}`);
    continue;
  }
  for (const [absolutePath, fileCoverage] of Object.entries(raw)) {
    const relative = path.relative(root, absolutePath).split(path.sep).join('/');
    const perFile = summarizeFile(fileCoverage);
    summary[relative] = perFile;
    mergedFinal[relative] = fileCoverage;
    fileCount += 1;
    for (const key of ['lines', 'statements', 'functions', 'branches']) {
      summary.total[key].total += perFile[key].total;
      summary.total[key].covered += perFile[key].covered;
      summary.total[key].skipped += perFile[key].skipped;
    }
  }
}

for (const key of ['lines', 'statements', 'functions', 'branches']) {
  summary.total[key].pct = pct(summary.total[key]);
}

if (fileCount === 0) {
  console.error('error: no coverage-final.json files found — run the suite with --coverage first');
  process.exit(1);
}

const outDir = path.join(root, 'coverage');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'coverage-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
// The action's default json-final-path is also resolved from the repo root.
// Merge the raw istanbul data so file-level views have a source.
writeFileSync(path.join(outDir, 'coverage-final.json'), `${JSON.stringify(mergedFinal)}\n`);

const t = summary.total;
console.log(
  `Merged ${fileCount} files from coverage-final.json into coverage/coverage-summary.json ` +
    `(statements ${t.statements.pct}%, branches ${t.branches.pct}%, functions ${t.functions.pct}%, lines ${t.lines.pct}%)`,
);
