#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function source(path) {
  return readFileSync(join(root, path), 'utf8');
}

const adminRoutes = trackedFiles().filter((path) => /^apps\/web\/src\/app\/api\/admin\/.*\/route\.ts$/.test(path));
for (const path of adminRoutes) {
  if (!source(path).includes('withAdminAuth')) failures.push(`${path}: missing withAdminAuth`);
}

const cronRoutes = trackedFiles().filter((path) => /^apps\/web\/src\/app\/api\/cron\/.*\/route\.ts$/.test(path));
for (const path of cronRoutes) {
  if (!source(path).includes('withCronAuth')) failures.push(`${path}: missing withCronAuth`);
}

const security = source('SECURITY.md');
if (!security.includes("GitHub's private vulnerability reporting")) {
  failures.push('SECURITY.md: private vulnerability reporting instructions are missing');
}
if (!security.includes('do not open a public issue')) {
  failures.push('SECURITY.md: vulnerability reporting instructions are incomplete');
}
if (/security@[a-z0-9.-]+\.[a-z]{2,}/i.test(security)) {
  failures.push('SECURITY.md: contains an unverified public security email address');
}

const scanner = source('scripts/check-oss-release.mjs');
if (!scanner.includes('git') || !scanner.includes('ls-files')) {
  failures.push('check-oss-release.mjs: current-tree Git release scan is missing');
}
if (!existsSync(join(root, 'scripts/check-git-history-secrets.mjs'))) {
  failures.push('scripts/check-git-history-secrets.mjs: Git-history scanner is missing');
}

if (failures.length) {
  console.error('P0 release check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`P0 release check passed (${adminRoutes.length} admin routes, ${cronRoutes.length} cron routes).`);
