#!/usr/bin/env node

/**
 * Static checks for the public Docker deployment contract.
 * This intentionally does not invoke Docker, mutate volumes, or access a DB.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
const appEntrypoint = readFileSync(resolve(root, 'apps/web/docker-entrypoint.sh'), 'utf8');
const vmCompose = readFileSync(resolve(root, 'infra/cron-vm/docker-compose.vm.yml'), 'utf8');
const migrator = readFileSync(resolve(root, 'apps/web/scripts/migrate-runtime.mjs'), 'utf8');
const failures = [];

function requireText(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message);
}

requireText(compose, /services:\s*\n\s+db:/, 'Compose must define a database service.');
requireText(compose, /services:[\s\S]*\n\s+app:/, 'Compose must define an app service.');
requireText(compose, /services:[\s\S]*\n\s+worker:/, 'Compose must define a worker service.');
requireText(
  compose,
  /POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD:\?/,
  'Database password must be required, not silently defaulted.',
);
requireText(
  compose,
  /KESTREL_LOCAL_DOCKER:\s*["']?true/,
  'Compose must explicitly opt into local Docker migration behavior.',
);
requireText(compose, /healthcheck:/, 'Compose services must expose health checks.');
requireText(
  appEntrypoint,
  /DIRECT_URL.*POSTGRES_URL_NON_POOLING/,
  'App migrations must prefer a direct database URL.',
);
requireText(
  appEntrypoint,
  /KESTREL_LOCAL_DOCKER/,
  'App entrypoint must gate the local DATABASE_URL migration fallback.',
);
requireText(
  migrator,
  /migrationsSchema:\s*'drizzle'/,
  'Runtime migrations must use the canonical drizzle schema.',
);
requireText(
  migrator,
  /MULTI_USER_ENABLED and KESTREL_ENABLE_RLS/,
  'Runtime migrations must fail closed on partial tenant configuration.',
);
requireText(
  migrator,
  /registrationMode === 'open'/,
  'Runtime migrations must guard unsafe open registration.',
);
requireText(compose, /MULTI_USER_ENABLED:\s*["']?0/, 'Compose must default to single-user mode.');
requireText(
  compose,
  /REGISTRATION_MODE:\s*["']?owner-first/,
  'Compose must default to owner-first registration.',
);
requireText(
  compose,
  /KESTREL_ENABLE_RLS:\s*["']?0/,
  'Compose must disable unsupported OSS RLS mode.',
);
requireText(
  `${compose}\n${appEntrypoint}\n${migrator}`,
  /backup|restore/i,
  'Deployment configuration must contain backup/restore support.',
);
requireText(compose, /127\.0\.0\.1:5432/, 'Default database publishing must bind to localhost.');
requireText(
  compose,
  /Authorization: Bearer \$\$\{WORKER_HEALTH_TOKEN\}/,
  'Worker healthcheck must send the production health token.',
);
requireText(
  compose,
  /Health port is intentionally not published by default/,
  'Worker health exposure must remain explicitly private by default.',
);
requireText(
  vmCompose,
  /127\.0\.0\.1:8082:8082/,
  'Worker proxy listener must bind privately in the VM deployment.',
);
requireText(
  compose,
  /MULTI_USER_ENABLED:\s*["']?0/,
  'Compose must keep shared mode disabled until P2 isolation is proven.',
);

if (failures.length) {
  console.error('Compose reproducibility check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Compose reproducibility check passed.');
}
