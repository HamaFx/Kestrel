#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];
for (const file of ['package.json', 'pnpm-lock.yaml', 'LICENSE', 'NOTICE']) {
  if (!existsSync(resolve(root, file))) failures.push(`missing ${file}`);
}
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (packageJson.license !== 'Apache-2.0') failures.push('package license must be Apache-2.0');
if (!packageJson.packageManager?.startsWith('pnpm@')) failures.push('package manager must be pinned to pnpm');
if (!existsSync(resolve(root, 'scripts/generate-sbom.mjs'))) failures.push('missing scripts/generate-sbom.mjs');
if (!existsSync(resolve(root, 'scripts/generate-license-report.mjs'))) failures.push('missing scripts/generate-license-report.mjs');
if (!existsSync(resolve(root, 'DEPENDENCY_LICENSES.md'))) failures.push('missing dependency license inventory');
if (!existsSync(resolve(root, '.github/workflows/release.yml'))) failures.push('missing release workflow');
if (failures.length) {
  console.error('Dependency report contract failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Dependency report contract passed. Use pnpm audit and a license tool for networked reports.');
