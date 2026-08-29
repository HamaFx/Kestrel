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

for (const key of ['AUTH_SECRET', 'CRON_SECRET', 'ENCRYPTION_SECRET', 'BYOK_ENABLED', 'MULTI_USER_ENABLED', 'REGISTRATION_MODE', 'KESTREL_ENABLE_RLS', 'OSS_SINGLE_USER_MODE']) {
  if (!exampleKeys.has(key) && !templateKeys.has(key)) failures.push(`OSS environment contract is missing ${key}`);
}

for (const key of ['POSTGRES_PASSWORD', 'AUTH_SECRET', 'CRON_SECRET', 'ENCRYPTION_SECRET', 'BYOK_ENABLED', 'MULTI_USER_ENABLED', 'REGISTRATION_MODE', 'KESTREL_ENABLE_RLS']) {
  if (!templateKeys.has(key)) failures.push('secret-template.json is missing ' + key);
}

for (const key of composeKeys) {
  if (key === 'POSTGRES_PUBLISHED_PORT') continue;
  if (!exampleKeys.has(key) && !templateKeys.has(key)) {
    failures.push(`Compose variable ${key} is absent from .env.example and secret-template.json`);
  }
}

if (!/MULTI_USER_ENABLED\s*:\s*["']?0/.test(compose)) failures.push('Compose must force MULTI_USER_ENABLED=0');
if (!/KESTREL_ENABLE_RLS\s*:\s*["']?0/.test(compose)) failures.push('Compose must force KESTREL_ENABLE_RLS=0');
if (!/REGISTRATION_MODE\s*:\s*owner-first/.test(compose)) failures.push('Compose must force REGISTRATION_MODE=owner-first');
if (!/OSS_SINGLE_USER_MODE\s*:\s*["']?1/.test(compose)) failures.push('Compose must force OSS_SINGLE_USER_MODE=1');
if (!/DIRECT_URL.*POSTGRES_URL_NON_POOLING/.test(shared)) failures.push('Shared env must define direct migration URL variables');
// The worker consumes the application connection; migration URL selection is
// intentionally centralized in the web/db migration scripts rather than duplicated here.
if (!/DATABASE_URL|POSTGRES_URL/.test(worker)) failures.push('Worker env must define database URL handling');

if (failures.length) {
  console.error('Environment contract check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Environment contract check passed.');
