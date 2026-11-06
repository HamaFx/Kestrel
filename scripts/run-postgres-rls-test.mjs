#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const container = `kestrel-p2-postgres-${randomUUID().slice(0, 8)}`;
const hostPort = process.env.P2_POSTGRES_PORT ?? '55439';
const password = 'kestrel-p2-test-password';
const appPassword = 'kestrel-p2-app-password';
const url = `postgres://postgres:${password}@127.0.0.1:${hostPort}/postgres`;
const appUrl = `postgres://kestrel_app:${appPassword}@127.0.0.1:${hostPort}/postgres`;
const envFile = resolve(root, '.tmp-p2-postgres.env');

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

function cleanup() {
  spawnSync('docker', ['rm', '--force', container], { cwd: root, stdio: 'ignore' });
  rmSync(envFile, { force: true });
}

if (!existsSync(resolve(root, 'node_modules'))) {
  console.error('Dependencies are not installed; run pnpm install first.');
  process.exit(1);
}

mkdirSync(resolve(root, '.tmp'), { recursive: true });
writeFileSync(
  envFile,
  [
    `TEST_POSTGRES_ADMIN_URL=${url}`,
    `TEST_POSTGRES_APP_URL=${appUrl}`,
    'RUN_POSTGRES_RLS_TESTS=1',
    'RUN_AI_QUEUE_POSTGRES_TESTS=1',
    'DB_DISABLE_SSL=true',
    '',
  ].join('\n'),
);

const privilegedEnv = {
  ...process.env,
  DIRECT_URL: url,
  ADMIN_DATABASE_URL: url,
  DATABASE_URL: url,
  POSTGRES_APP_PASSWORD: appPassword,
  MULTI_USER_ENABLED: '1',
  KESTREL_ENABLE_RLS: '1',
  DB_DISABLE_SSL: 'true',
  NODE_ENV: 'test',
};

const integrationEnv = {
  ...process.env,
  TEST_POSTGRES_ADMIN_URL: url,
  TEST_POSTGRES_APP_URL: appUrl,
  RUN_POSTGRES_RLS_TESTS: '1',
  RUN_AI_QUEUE_POSTGRES_TESTS: '1',
  DB_DISABLE_SSL: 'true',
  KESTREL_LOCAL_DOCKER: 'true',
  NODE_ENV: 'test',
};

try {
  run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--publish',
    `127.0.0.1:${hostPort}:5432`,
    '--env',
    'POSTGRES_USER=postgres',
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    // The image starts a temporary Unix-socket-only server while init scripts
    // run, then restarts. Probe TCP so the healthcheck only turns green once
    // the final server is accepting connections.
    '--health-cmd',
    'pg_isready -h 127.0.0.1 -U postgres',
    '--health-interval',
    '1s',
    '--health-timeout',
    '3s',
    '--health-retries',
    '60',
    'pgvector/pgvector:pg16',
  ]);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync(
      'docker',
      ['inspect', '--format', '{{.State.Health.Status}}', container],
      { encoding: 'utf8' },
    );
    if (result.stdout?.trim() === 'healthy') break;
    if (attempt === 59) throw new Error('PostgreSQL did not become ready within 60 seconds');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  // Apply the real migration chain and provision the non-bypass app role the
  // web and RLS suites connect as. `migrate:apply` requires a direct URL.
  run('pnpm', ['--filter', '@kestrel/db', 'migrate:apply'], { env: privilegedEnv });
  run('pnpm', ['--filter', '@kestrel/db', 'provision:app-role'], { env: privilegedEnv });

  // All six Postgres-gated suites share one disposable database.
  run(
    'pnpm',
    [
      '--filter',
      '@kestrel/db',
      'exec',
      'vitest',
      'run',
      'test/postgres-app-role.test.ts',
      'test/postgres-auth-rls.test.ts',
      'test/money-exactness.test.ts',
    ],
    { env: integrationEnv },
  );
  run(
    'pnpm',
    ['--filter', '@kestrel/ai', 'exec', 'vitest', 'run', 'test/alerts-claim-postgres.test.ts'],
    { env: integrationEnv },
  );
  run(
    'pnpm',
    ['--filter', '@kestrel/worker', 'exec', 'vitest', 'run', 'test/candle-outbox-postgres.test.ts'],
    { env: integrationEnv },
  );
  run(
    'pnpm',
    ['--filter', '@kestrel/web', 'exec', 'vitest', 'run', 'test/settings-actions-app-role.test.ts'],
    { env: integrationEnv },
  );
} finally {
  cleanup();
}
