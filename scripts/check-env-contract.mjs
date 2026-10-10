#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
const read = (file) => readFileSync(resolve(root, file), 'utf8');

const example = read('.env.example');
const shared = read('packages/shared/src/env.ts');
const worker = read('apps/worker/src/env.ts');
const template = JSON.parse(read('scripts/setup/secret-template.json'));
const compose = read('docker-compose.yml');

const exampleKeys = new Set(
  [...example.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]),
);
const canonicalKeys = new Set(
  [...`${shared}\n${worker}`.matchAll(/\b([A-Z][A-Z0-9_]{2,})\s*:/g)].map((match) => match[1]),
);
const templateKeys = new Set(Object.keys(template.defaults ?? {}));
const composeKeys = new Set(
  [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::[-?][^}]*)?\}/g)].map((match) => match[1]),
);

for (const key of [
  'AUTH_SECRET',
  'CRON_SECRET',
  'ENCRYPTION_SECRET',
  'BYOK_ENABLED',
  'MULTI_USER_ENABLED',
  'REGISTRATION_MODE',
  'KESTREL_ENABLE_RLS',
]) {
  if (!exampleKeys.has(key) && !templateKeys.has(key))
    failures.push(`Environment contract is missing ${key}`);
}

for (const key of [
  'POSTGRES_PASSWORD',
  'AUTH_SECRET',
  'CRON_SECRET',
  'ENCRYPTION_SECRET',
  'BYOK_ENABLED',
  'MULTI_USER_ENABLED',
  'REGISTRATION_MODE',
  'KESTREL_ENABLE_RLS',
  'WORKER_HEALTH_TOKEN',
  'BIQUOTE_PROXY_TOKEN',
]) {
  if (!templateKeys.has(key)) failures.push('secret-template.json is missing ' + key);
}

for (const key of composeKeys) {
  // Host ports, not secrets — remapped by the setup wizard at launch.
  if (key === 'POSTGRES_PUBLISHED_PORT' || key === 'APP_PUBLISHED_PORT') continue;
  if (!exampleKeys.has(key) && !templateKeys.has(key)) {
    failures.push(`Compose variable ${key} is absent from .env.example and secret-template.json`);
  }
}

if (!/MULTI_USER_ENABLED\s*:\s*["']?1/.test(compose))
  failures.push('Compose must force MULTI_USER_ENABLED=1');
if (!/KESTREL_ENABLE_RLS\s*:\s*["']?1/.test(compose))
  failures.push('Compose must force KESTREL_ENABLE_RLS=1');
if (!/REGISTRATION_MODE\s*:\s*open/.test(compose))
  failures.push('Compose must force REGISTRATION_MODE=open');
if (compose.includes('OSS_SINGLE_USER_MODE'))
  failures.push('Compose contains stale single-user flag OSS_SINGLE_USER_MODE');
if (example.includes('OSS_SINGLE_USER_MODE'))
  failures.push('.env.example contains stale single-user flag OSS_SINGLE_USER_MODE');
if (!/DIRECT_URL.*POSTGRES_URL_NON_POOLING/.test(shared))
  failures.push('Shared env must define direct migration URL variables');
// The worker consumes the application connection; migration URL selection is
// intentionally centralized in the web/db migration scripts rather than duplicated here.
if (!/DATABASE_URL|POSTGRES_URL/.test(worker))
  failures.push('Worker env must define database URL handling');
if (!/WORKER_HEALTH_TOKEN\s*:\s*optionalNonEmpty/.test(worker))
  failures.push('Worker env must define WORKER_HEALTH_TOKEN');
if (!/BIQUOTE_PROXY_TOKEN\s*:\s*optionalNonEmpty/.test(worker))
  failures.push('Worker env must define BIQUOTE_PROXY_TOKEN');
if (!/WORKER_HEALTH_TOKEN/.test(read('docs/configuration.md')))
  failures.push('Configuration docs must describe WORKER_HEALTH_TOKEN');
if (!/BIQUOTE_PROXY_TOKEN/.test(read('docs/configuration.md')))
  failures.push('Configuration docs must describe BIQUOTE_PROXY_TOKEN');

if (failures.length) {
  console.error('Environment contract check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Environment contract check passed.');
