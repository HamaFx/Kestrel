#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lockPath = resolve('pnpm-lock.yaml');
const outputPath = resolve('DEPENDENCY_LICENSES.md');
const lock = readFileSync(lockPath, 'utf8');
const packages = new Set();
for (const line of lock.split('\n')) {
  const match = line.match(/^ {2}((?:@[^/]+\/)?[^@\s:]+)@/);
  if (match) packages.add(match[1]);
}
const names = [...packages].sort((a, b) => a.localeCompare(b));
const lines = [
  '# Dependency license inventory',
  '',
  '> Generated from `pnpm-lock.yaml`. Verify each package license from its published metadata before redistributing a release.',
  '',
  '| Package | License status |',
  '|---|---|',
  ...names.map((name) => `| \`${name}\` | Verify from package metadata |`),
  '',
  'This inventory is intentionally conservative: lockfiles do not reliably encode license metadata. A release process should supplement it with a networked license scanner and archive the resulting report.',
  '',
];
writeFileSync(outputPath, lines.join('\n'));
console.log(`Wrote ${names.length} dependency entries to ${outputPath}`);
