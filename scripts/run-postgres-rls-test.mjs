#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const container = `kestrel-p2-postgres-${randomUUID().slice(0, 8)}`;
const hostPort = process.env.P2_POSTGRES_PORT ?? '55439';
const password = 'kestrel-p2-test-password';
const url = `postgres://postgres:${password}@127.0.0.1:${hostPort}/postgres`;
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
writeFileSync(envFile, `TEST_POSTGRES_ADMIN_URL=${url}\nRUN_POSTGRES_RLS_TESTS=1\n`);

try {
  run('docker', [
    'run', '--detach', '--rm', '--name', container,
    '--publish', `127.0.0.1:${hostPort}:5432`,
    '--env', 'POSTGRES_USER=postgres',
    '--env', `POSTGRES_PASSWORD=${password}`,
    'pgvector/pgvector:pg16',
  ]);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' });
    if (result.status === 0) break;
    if (attempt === 29) throw new Error('PostgreSQL did not become ready within 30 seconds');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  run('pnpm', ['--filter', '@kestrel/db', 'test', '--', '--run', 'test/postgres-rls-isolation.test.ts'], {
    env: { ...process.env, RUN_POSTGRES_RLS_TESTS: '1', TEST_POSTGRES_ADMIN_URL: url },
  });
} finally {
  cleanup();
}
