#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const lockPath = resolve('pnpm-lock.yaml');
const outputPath = resolve(process.env.LICENSE_OUTPUT ?? 'docs/DEPENDENCY_LICENSES.md');
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
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, lines.join('\n'));

const jsonPath = resolve(process.env.LICENSE_JSON_OUTPUT ?? 'artifacts/licenses/dependency-licenses.json');
mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'pnpm-lock.yaml',
      verificationRequired: true,
      packages: names.map((name) => ({ name, licenseStatus: 'verify-from-package-metadata' })),
    },
    null,
    2,
  ) + '\n',
);
console.log(`Wrote ${names.length} dependency entries to ${outputPath} and ${jsonPath}`);
