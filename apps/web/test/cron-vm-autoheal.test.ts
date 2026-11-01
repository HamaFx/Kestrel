/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// R16 (audit 2026-10-31) — the autoheal loop must not restart a busy worker.
//
// This runs the real script with stubbed `docker` and `curl` binaries, so the
// busy-versus-wedged classification is exercised rather than grepped:
//   - an unhealthy Docker status + a 200 /health/jobs means "busy, healthy":
//     no restart and the consecutive-unhealthy counter resets;
//   - a 503 or an unanswered probe counts, and three in a row restart.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const SCRIPT = resolve(root, 'infra/cron-vm/scripts/docker-autoheal.sh');

interface Sandbox {
  dir: string;
  stateFile: string;
  restartLog: string;
  env: NodeJS.ProcessEnv;
}

const scopes: Sandbox[] = [];

function createSandbox(): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), 'kestrel-autoheal-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const stateFile = join(dir, 'autoheal-state');
  const restartLog = join(dir, 'restarts');
  const envFile = join(dir, '.env');
  writeFileSync(envFile, 'WORKER_HEALTH_TOKEN=test-token\n');
  writeFileSync(stateFile, '0\n');

  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "inspect" ]]; then
  printf '%s\\n' "\${FAKE_HEALTH_STATUS:-unhealthy}"
  exit 0
fi
if [[ "\${1:-}" == "restart" ]]; then
  printf '%s\\n' "\$*" >> "\${FAKE_RESTART_LOG}"
  exit 0
fi
exit 0
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, 'curl'),
    `#!/usr/bin/env bash
if [[ "\${FAKE_CURL_EXIT:-0}" != "0" ]]; then
  exit "\${FAKE_CURL_EXIT}"
fi
printf '%s\\n%s' "\${FAKE_CURL_BODY:-}" "\${FAKE_CURL_CODE:-200}"
`,
    { mode: 0o755 },
  );

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    KESTREL_WORKER_CONTAINER: 'test-worker',
    KESTREL_WORKER_HEALTH_URL: 'http://127.0.0.1:8081/health/jobs',
    KESTREL_ENV_FILE: envFile,
    KESTREL_AUTOHEAL_STATE_FILE: stateFile,
    FAKE_RESTART_LOG: restartLog,
    FAKE_CURL_CODE: '200',
    FAKE_CURL_BODY: '{"jobsHealthy":true}',
    FAKE_HEALTH_STATUS: 'unhealthy',
  } as NodeJS.ProcessEnv;

  const sandbox = { dir, stateFile, restartLog, env };
  scopes.push(sandbox);
  return sandbox;
}

function run(sandbox: Sandbox, overrides: NodeJS.ProcessEnv = {}): void {
  execFileSync('bash', [SCRIPT], { env: { ...sandbox.env, ...overrides }, stdio: 'pipe' });
}

function state(sandbox: Sandbox): string {
  return readFileSync(sandbox.stateFile, 'utf8').trim();
}

function restarts(sandbox: Sandbox): string[] {
  try {
    return readFileSync(sandbox.restartLog, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

afterEach(() => {
  for (const sandbox of scopes.splice(0)) rmSync(sandbox.dir, { recursive: true, force: true });
});

describe('docker-autoheal busy-versus-wedged classification', () => {
  it('does not count a worker that answers 200 while Docker reports unhealthy', () => {
    const sandbox = createSandbox();
    writeFileSync(sandbox.stateFile, '2\n');

    run(sandbox, { FAKE_CURL_CODE: '200', FAKE_CURL_BODY: '{"jobsHealthy":true,"idle":false}' });

    expect(state(sandbox)).toBe('0');
    expect(restarts(sandbox)).toEqual([]);
  });

  it('counts a wedged job and restarts after three consecutive checks', () => {
    const sandbox = createSandbox();

    run(sandbox, { FAKE_CURL_CODE: '503', FAKE_CURL_BODY: '{"jobsHealthy":false}' });
    run(sandbox, { FAKE_CURL_CODE: '503', FAKE_CURL_BODY: '{"jobsHealthy":false}' });
    expect(state(sandbox)).toBe('2');
    expect(restarts(sandbox)).toEqual([]);

    run(sandbox, { FAKE_CURL_CODE: '503', FAKE_CURL_BODY: '{"jobsHealthy":false}' });

    expect(state(sandbox)).toBe('0');
    expect(restarts(sandbox)).toEqual(['restart test-worker']);
  });

  it('counts an unresponsive worker and restarts after three checks', () => {
    const sandbox = createSandbox();

    run(sandbox, { FAKE_CURL_EXIT: '7' });
    run(sandbox, { FAKE_CURL_EXIT: '7' });
    run(sandbox, { FAKE_CURL_EXIT: '7' });

    expect(restarts(sandbox)).toEqual(['restart test-worker']);
  });
});
