#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const compose = read('docker-compose.yml');
const env = read('packages/shared/src/env.ts');
const readme = read('README.md');
const capabilities = read('packages/shared/src/capabilities.ts');
const findings = read('docs/audit/findings.md');
const workerEnv = read('apps/worker/src/env.ts');
const configuration = read('docs/configuration.md');

for (const [pattern, message] of [
  [/MULTI_USER_ENABLED:\s*["']?0/, 'Compose must disable multi-user mode'],
  [/KESTREL_ENABLE_RLS:\s*["']?0/, 'Compose must disable RLS mode'],
  [/OSS_SINGLE_USER_MODE:\s*["']?1/, 'Compose must enable single-user mode'],
  [/REGISTRATION_MODE:\s*["']?owner-first/, 'Compose must use owner-first registration'],
]) {
  if (!pattern.test(compose)) failures.push(message);
}
if (!env.includes('OSS_SINGLE_USER_MODE')) failures.push('environment schema must define OSS_SINGLE_USER_MODE');
if (!capabilities.includes('langfuse-prompt-output-capture')) failures.push('capability report must expose prompt/output capture status');
if (!readme.includes('single-user, self-hosted preview')) failures.push('README must state the single-user OSS boundary');
if (!/independent (?:external )?security review/i.test(findings)) failures.push('findings must retain the independent security review gate');
if (!/WORKER_HEALTH_TOKEN/.test(workerEnv) || !/BIQUOTE_PROXY_TOKEN/.test(workerEnv)) failures.push('worker must define both production protection tokens');
if (!/WORKER_HEALTH_TOKEN/.test(configuration) || !/BIQUOTE_PROXY_TOKEN/.test(configuration)) failures.push('configuration must document both worker protection tokens');

if (failures.length) {
  console.error('Single-user release check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Single-user release contract passed.');
