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

// Heavy-job runner CLI. Invoked from systemd one-shot units:
//
//   ExecStart=/usr/bin/node /opt/kestrel/app/apps/worker/dist/runner/cli.js <name>
//
// Resolves env, builds a logger pre-tagged with the job name, pings
// healthchecks.io start/success/fail, and runs the registered job
// function. Exit codes:
//   0  — success
//   1  — env / argv error (job not found, env malformed)
//   2  — job threw (already pinged fail)

import { closeDb } from '@kestrel/db';

import { acquireCronLock, type CronLock } from '../cron-lock.js';
import { loadEnv } from '../env.js';
import { withHeartbeat } from '../healthchecks.js';
import { JOBS, type JobName } from '../jobs/index.js';
import { createLogger } from '../log.js';
import { SKIP_DAILY_LOCK } from '../scheduler.js';
import { tenantRouter } from '../tenant-router.js';

function isKnownJob(name: string): name is JobName {
  return name in JOBS;
}

/**
 * Resolve the healthchecks.io UUID for a job from the JOBS registry.
 * Each job registration carries its `hcUuidEnvVar` so the mapping is
 * data-driven rather than a switch statement (PF-04).
 */
function resolveHcUuid(env: ReturnType<typeof loadEnv>, name: JobName): string | undefined {
  const job = JOBS[name];
  if (!job?.hcUuidEnvVar) return undefined;
  const value = env[job.hcUuidEnvVar];
  return typeof value === 'string' ? value : undefined;
}

export async function runJob(jobName: JobName): Promise<number> {
  const { loadSecretsFromVault } = await import('@kestrel/shared/vault');
  await loadSecretsFromVault();

  let env: ReturnType<typeof loadEnv>;
  try {
    env = loadEnv();
  } catch (err) {
    process.stderr.write(String(err) + '\n');
    return 1;
  }

  const log = createLogger({ service: `worker:job:${jobName}`, commit: env.DEPLOYED_SHA });
  const { initLangfuse, shutdownLangfuse } = await import('@kestrel/ai');
  initLangfuse({ service: 'worker' });

  const job = JOBS[jobName];
  const hcUuid = resolveHcUuid(env, jobName);

  const timeoutMs = Number(process.env.JOB_TIMEOUT_MS) || 120_000;
  const ac = new AbortController();
  const timer = setTimeout(() => {
    log.warn('Job timed out — aborting', { timeoutMs });
    ac.abort(new Error(`Job timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  timer.unref();

  // SIGTERM from systemd → AbortSignal so jobs can short-circuit cleanly.
  const sigtermHandler = (): void => {
    log.warn('SIGTERM received — aborting job');
    ac.abort(new Error('SIGTERM'));
  };
  process.on('SIGTERM', sigtermHandler);
  process.on('SIGINT', sigtermHandler);

  let lock: CronLock | null = null;
  const useLock = !SKIP_DAILY_LOCK.has(jobName);
  if (useLock) {
    try {
      const { getDb } = await import('@kestrel/ai');
      lock = await acquireCronLock(jobName, getDb());
      if (!lock) {
        log.info('Job skipped — already ran today (idempotency guard)');
        clearTimeout(timer);
        return 0;
      }
    } catch (lockErr) {
      log.error('Failed to acquire cron lock in CLI runner — failing closed', {
        err: String(lockErr),
      });
      clearTimeout(timer);
      return 1;
    }
  }

  try {
    const result = await withHeartbeat(hcUuid, async () => {
      const r = await job.run({ log, signal: ac.signal, tenantRouter });
      return r;
    });
    if (lock) await lock.done(result.note);
    log.info('job completed', { processed: result.processed, note: result.note });
    return 0;
  } catch (err) {
    if (lock) await lock.fail(err);
    const stack = err instanceof Error && typeof err.stack === 'string' ? err.stack : String(err);
    log.error('job failed', { err: String(err), stack });
    return 2;
  } finally {
    clearTimeout(timer);
    try {
      const { flushMastraObservability, getKestrelMastra, closeKestrelMastra } =
        await import('@kestrel/ai/mastra');
      await flushMastraObservability(getKestrelMastra().instance).catch(() => {});
      await shutdownLangfuse();
      await closeKestrelMastra();
    } catch {
      // Best-effort observability flush
    }
    await closeDb();
    process.removeListener('SIGTERM', sigtermHandler);
    process.removeListener('SIGINT', sigtermHandler);
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const jobName = argv[0];

  if (!jobName) {
    process.stderr.write(
      `usage: runner <job-name>\n  available: ${Object.keys(JOBS).join(', ')}\n`,
    );
    return 1;
  }

  if (!isKnownJob(jobName)) {
    process.stderr.write(`unknown job: ${jobName}\n  available: ${Object.keys(JOBS).join(', ')}\n`);
    return 1;
  }

  return runJob(jobName);
}

// Entry-point detection so vitest can import without running.
const isEntryPoint = (() => {
  try {
    const moduleUrl = new URL(import.meta.url).pathname;
    const argv1 = process.argv[1];
    return Boolean(argv1) && (moduleUrl === argv1 || moduleUrl.endsWith(argv1!));
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  void main().then((code) => {
    process.exit(code);
  });
}
