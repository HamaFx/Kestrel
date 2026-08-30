#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));

if (pkg.engines?.node !== '>=22.13.0') failures.push('package.json Node engine must be >=22.13.0');
if (!read('README.md').includes('Node.js 22.13'))
  failures.push('README must document Node.js 22.13+');
if (!read('CONTRIBUTING.md').includes('22.13'))
  failures.push('CONTRIBUTING.md must document Node.js 22.13+');
if (!existsSync(resolve(root, 'scripts/check-route-security.mjs')))
  failures.push('scripts/check-route-security.mjs: route security classification check is missing');
if (!existsSync(resolve(root, 'scripts/check-env-contract.mjs')))
  failures.push('scripts/check-env-contract.mjs: environment contract check is missing');

for (const file of ['Dockerfile', 'Dockerfile.worker']) {
  const lines = read(file)
    .split('\n')
    .filter((line) => /^\s*FROM\s+/i.test(line));
  for (const line of lines) {
    const image = line.match(/^\s*FROM\s+([^\s]+)/i)?.[1] ?? '';
    if (image.toLowerCase() === 'base') continue;
    const digest = image.match(/@sha256:(.*)$/i)?.[1];
    if (!digest || !/^[a-f0-9]{64}$/i.test(digest))
      failures.push(
        `${file}: every external FROM image needs a verified 64-character sha256 digest`,
      );
    if (/placeholder|7f2c5d9a1b0a0f2d6f2d6f0a2e9b4a7b0f4d3c6e8a1f2c3d4/i.test(image))
      failures.push(`${file}: placeholder image digest detected`);
    if (/:[^@\s]*(?:latest|main|master)$/i.test(image))
      failures.push(`${file}: mutable image tag detected`);
  }
}

for (const file of execFileSync('git', ['ls-files', '.github/workflows'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)) {
  if (/uses:\s*[^\s@]+@(main|master)(?:\s|$)/im.test(read(file)))
    failures.push(`${file}: mutable branch action reference`);
}
for (const file of [
  '.github/workflows/docker-publish.yml',
  '.github/workflows/release.yml',
  'LICENSE',
  'SECURITY.md',
  'scripts/check-oss-release.mjs',
  'docs/DEPENDENCY_LICENSES.md',
]) {
  if (!existsSync(resolve(root, file))) failures.push(`${file}: required release asset is missing`);
}

if (failures.length) {
  console.error('P3 release check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('P3 release check passed.');
