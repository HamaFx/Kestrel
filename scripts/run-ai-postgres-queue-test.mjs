#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const container = `kestrel-ai-queue-postgres-${randomUUID().slice(0, 8)}`;
const hostPort = process.env.AI_QUEUE_POSTGRES_PORT ?? '55441';
const password = 'kestrel-ai-queue-password';
const url = `postgres://postgres:${password}@127.0.0.1:${hostPort}/postgres`;

if (!existsSync(resolve(root, 'node_modules'))) {
  console.error('Dependencies are not installed; run pnpm install first.');
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

function cleanup() {
  spawnSync('docker', ['rm', '--force', container], { cwd: root, stdio: 'ignore' });
}

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
    'pgvector/pgvector:pg16',
  ]);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], {
      encoding: 'utf-8',
    });
    if (result.status === 0) break;
    if (attempt === 29) throw new Error('PostgreSQL did not become ready within 30 seconds');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  run(
    'pnpm',
    ['--filter', '@kestrel/ai', 'test', '--', '--run', 'test/full-analysis-properties.test.ts', 'test/mastra-v2-full-analysis.test.ts'],
    {
      env: {
        ...process.env,
        RUN_AI_QUEUE_POSTGRES_TESTS: '1',
        TEST_POSTGRES_ADMIN_URL: url,
      },
    },
  );
} finally {
  cleanup();
}
