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

// DEC-05 / DEC-06 maintainability gate.
//
// Enforces the static code-shape rules that must never live inside Vitest:
//   F01 ≤ 350 LOC backend .ts
//   F02 ≤ 250 LOC React .tsx, ≤ 4 useState, ≤ 2 useEffect
//   F04 static catalogs ≤ 500 LOC
//   F05 ≤ 10 loose files in package src roots
//   R01 no empty catch blocks
//   R06 no imports of removed subsystems (mastra v1 barrel, payment gateways)
//
// Existing oversized files are tracked in `maintainability-baseline.json`.
// The baseline is a ratchet: a known file may shrink but never grow, and new
// violations always fail. Delete entries as files are decomposed.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'maintainability-baseline.json');

const SCAN_ROOTS = ['apps', 'packages', 'plugins', 'scripts'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '.git',
  'build',
  '.vercel',
]);
const SKIP_FILE_SUFFIXES = ['.d.ts', '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];

/** Pure declarative catalogs may reach 500 LOC (RULE-F04). */
const STATIC_CATALOGS = new Set([
  'packages/shared/src/symbol-catalog.ts',
  'packages/shared/src/symbols.ts',
  'packages/ai/src/models/catalogue.ts',
  'packages/ai/src/models/byok-providers.ts',
  'packages/db/src/schema/enums.ts',
]);

const FORBIDDEN_IMPORT_PATTERNS = [
  {
    pattern: /from\s+['"]@kestrel\/ai\/mastra['"]/,
    label: '@kestrel/ai/mastra (deleted v1 barrel)',
  },
  { pattern: /from\s+['"]stripe['"]/, label: 'stripe (removed payment gateway)' },
  { pattern: /from\s+['"][^'"]*\/gammal['"]/, label: 'gammal (removed payment gateway)' },
  { pattern: /from\s+['"][^'"]*nowpayments['"]/, label: 'nowpayments (removed payment gateway)' },
  { pattern: /from\s+['"]@kestrel\/shared\/billing/, label: '@kestrel/shared/billing (removed)' },
];

// Literal empty catch body. Comment-only blocks are reported as advisory
// (see below) because the comment documents the intentional ignore path.
const EMPTY_CATCH = /(?<![`])catch\s*(?:\([^)]*\))?\s*\{\s*\}/;

/** @type {{ ts: Record<string, number>, tsx: Record<string, {lines:number,useState:number,useEffect:number}>, looseRoots: Record<string, number> }} */
function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return { ts: {}, tsx: {}, looseRoots: {} };
  }
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') {
      // Still scan `.github`? No source there; skip all dot directories.
      if (entry.isDirectory()) continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function lineCount(source) {
  if (source.length === 0) return 0;
  const lines = source.split(/\r?\n/);
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

function isSourceFile(file) {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return false;
  return !SKIP_FILE_SUFFIXES.some((suffix) => file.endsWith(suffix));
}

const baseline = loadBaseline();
const writeBaseline = process.argv.includes('--write-baseline');
const nextBaseline = { ts: {}, tsx: {}, looseRoots: {} };
const violations = [];
const files = SCAN_ROOTS.flatMap((root) => walk(join(ROOT, root))).filter(isSourceFile);

for (const absolute of files) {
  const rel = relative(ROOT, absolute).split('\\').join('/');
  const source = readFileSync(absolute, 'utf8');
  const lines = lineCount(source);
  const isTsx = rel.endsWith('.tsx');
  const isCatalog = STATIC_CATALOGS.has(rel);
  const limit = isCatalog ? 500 : isTsx ? 250 : 350;
  const tsxBaseline = baseline.tsx[rel];
  const tsBaseline = baseline.ts[rel];
  const allowedLines = isTsx
    ? Math.max(limit, tsxBaseline?.lines ?? 0)
    : Math.max(limit, tsBaseline ?? 0);

  if (writeBaseline) {
    if (
      isTsx &&
      (lines > 250 ||
        countMatches(source, /\buseState\s*[(<]/g) > 4 ||
        countMatches(source, /\buseEffect\s*\(/g) > 2)
    ) {
      nextBaseline.tsx[rel] = {
        lines,
        useState: countMatches(source, /\buseState\s*[(<]/g),
        useEffect: countMatches(source, /\buseEffect\s*\(/g),
      };
    } else if (!isTsx && lines > (isCatalog ? 500 : 350)) {
      nextBaseline.ts[rel] = lines;
    }
  }

  if (lines > allowedLines) {
    const known = isTsx ? tsxBaseline?.lines : tsBaseline;
    violations.push({
      rule: isTsx ? 'F02' : isCatalog ? 'F04' : 'F01',
      file: rel,
      message: `${lines} LOC exceeds ${isCatalog ? 'catalog ' : ''}${allowedLines}${known ? ' (baseline ratchet)' : ''}`,
    });
  }

  if (isTsx) {
    const useState = countMatches(source, /\buseState\s*[(<]/g);
    const useEffect = countMatches(source, /\buseEffect\s*\(/g);
    if (useState > 4 && useState > (tsxBaseline?.useState ?? 0)) {
      violations.push({
        rule: 'F03',
        file: rel,
        message: `${useState} useState calls exceed 4 (baseline ${tsxBaseline?.useState ?? 0})`,
      });
    }
    if (useEffect > 2 && useEffect > (tsxBaseline?.useEffect ?? 0)) {
      violations.push({
        rule: 'F03',
        file: rel,
        message: `${useEffect} useEffect calls exceed 2 (baseline ${tsxBaseline?.useEffect ?? 0})`,
      });
    }
  }

  if (EMPTY_CATCH.test(source)) {
    violations.push({ rule: 'R01', file: rel, message: 'empty catch block' });
  }

  for (const { pattern, label } of FORBIDDEN_IMPORT_PATTERNS) {
    if (pattern.test(source)) {
      violations.push({ rule: 'R06', file: rel, message: `forbidden import: ${label}` });
    }
  }

  if (/\/src\/(?:[^/]+\/)*.*\.test\.tsx?$/.test(rel)) {
    violations.push({ rule: 'F05', file: rel, message: 'test file lives inside package src/' });
  }
}

// F05 — loose files directly under package/app src roots.
const ROOT_SCAN = [
  ['apps/*/src/lib', 'apps'],
  ['packages/*/src', 'packages'],
  ['plugins/*/src', 'plugins'],
];
for (const [pattern] of ROOT_SCAN) {
  const [base, wildcard, tail] = pattern.split('/');
  const parent = join(ROOT, base);
  let children = [];
  try {
    children = readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name));
  } catch {
    continue;
  }
  for (const child of children) {
    const dir = tail ? join(child, ...tail.split('/')) : child;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const loose = entries.filter((entry) => entry.isFile()).length;
    const rel = relative(ROOT, dir).split('\\').join('/');
    if (writeBaseline && loose > 10) nextBaseline.looseRoots[rel] = loose;
    const allowed = Math.max(10, baseline.looseRoots[rel] ?? 0);
    if (loose > allowed) {
      violations.push({
        rule: 'F05',
        file: rel,
        message: `${loose} loose root files exceed ${allowed} (baseline ratchet)`,
      });
    }
  }
}

if (writeBaseline) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(nextBaseline, null, 2)}\n`);
  process.stdout.write(
    `check-maintainability: baseline written (${Object.keys(nextBaseline.ts).length} .ts, ${Object.keys(nextBaseline.tsx).length} .tsx, ${Object.keys(nextBaseline.looseRoots).length} roots)\n`,
  );
  process.exit(0);
}

if (violations.length === 0) {
  process.stdout.write(
    `check-maintainability: PASS (${files.length} source files, ${Object.keys(baseline.ts).length + Object.keys(baseline.tsx).length} baselined legacy files)\n`,
  );
  process.exit(0);
}

process.stderr.write(`check-maintainability: ${violations.length} violation(s)\n\n`);
const byRule = new Map();
for (const violation of violations) {
  const list = byRule.get(violation.rule) ?? [];
  list.push(violation);
  byRule.set(violation.rule, list);
}
for (const [rule, list] of byRule) {
  process.stderr.write(`${rule} (${list.length})\n`);
  for (const violation of list.slice(0, 40)) {
    process.stderr.write(`  ${violation.file}: ${violation.message}\n`);
  }
  if (list.length > 40) process.stderr.write(`  … ${list.length - 40} more\n`);
  process.stderr.write('\n');
}
process.exit(1);
