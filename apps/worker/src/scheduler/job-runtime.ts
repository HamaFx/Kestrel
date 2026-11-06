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

// Per-job execution machinery: in-flight guards, idempotency locks, the
// hard timeout race, and stuck/abort bookkeeping. Cron registration lives
// in `./start-scheduler.ts`; this module owns running one job safely.

import { createTenantRouterFromEnv } from '@kestrel/shared/tenant-partition';

import type { WorkerEnv } from '../env.js';
import { JOBS } from '../jobs/index.js';
import type { Logger } from '../log.js';
import { withHeartbeat } from '../runtime/healthchecks.js';
import {
  acquireJobLock,
  createJobTimeout,
  JOB_TIMEOUT_GRACE_MS,
  resolveJobTimeoutMs,
  type JobTimeout,
} from './job-execution.js';

const tenantRouter = createTenantRouterFromEnv();

// PERF-7: In-flight guard — ensures no two invocations of the same job
// overlap. Complements the DB-level acquireCronLock for daily-cadence jobs.
const _runningJobs = new Set<keyof typeof JOBS>();
// STAB-19: Track when each running job started so we can detect stuck
// entries (e.g., a synchronous throw before the finally block, or a crash
// between _runningJobs.add() and the try block). Entries older than 2×
// JOB_TIMEOUT_MS are pruned by a periodic cleanup timer.
const _jobStartedAt = new Map<keyof typeof JOBS, number>();
// Active AbortControllers for in-flight jobs. Aborted on shutdown so
// well-behaved jobs stop their work before the database connection closes.
const _activeControllers = new Set<JobTimeout>();

/** Wall-clock budget for one invocation of a job (per-job override wins). */
function effectiveJobTimeoutMs(name: keyof typeof JOBS): number {
  return resolveJobTimeoutMs(JOBS[name]?.timeoutMs);
}

// A job is wedged when it overruns its own budget plus a grace period.  The
// grace keeps ordinary slow runs from tripping the container healthcheck the
// moment they cross their timeout.
const STUCK_GRACE_MS = JOB_TIMEOUT_GRACE_MS;

interface StuckJobSummary {
  stuck: Array<{ name: string; stuckForMs: number }>;
  oldestStuckMs: number | null;
}

/** A scheduled job that is in flight but still inside its budget. */
interface RunningJobSummary {
  name: string;
  runningForMs: number;
}

export interface JobHealthSummary extends StuckJobSummary {
  /**
   * Jobs currently running and not past their budget. A long run shows up
   * here, not in `stuck`.
   */
  running: RunningJobSummary[];
}

/**
 * Pure busy-versus-wedged classification over start timestamps. A job counts
 * as stuck when it has been running longer than its own timeout plus the grace
 * period; anything else in flight is busy. The in-flight guard only releases
 * when the job's promise settles, so a wedged job blocks every future run of
 * that job until the process restarts — while a busy job must not be
 * restarted out from under its work.
 */
function summarizeJobHealth(
  entries: Iterable<[string, number]>,
  now: number,
  timeoutFor: (name: string) => number,
): JobHealthSummary {
  const stuck: StuckJobSummary['stuck'] = [];
  const running: RunningJobSummary[] = [];
  let oldest = 0;
  for (const [name, startedAt] of entries) {
    const runningForMs = now - startedAt;
    if (runningForMs > timeoutFor(name) + STUCK_GRACE_MS) {
      stuck.push({ name, stuckForMs: runningForMs });
      if (runningForMs > oldest) oldest = runningForMs;
    } else {
      running.push({ name, runningForMs });
    }
  }
  stuck.sort((a, b) => b.stuckForMs - a.stuckForMs);
  running.sort((a, b) => b.runningForMs - a.runningForMs);
  return { stuck, running, oldestStuckMs: stuck.length > 0 ? oldest : null };
}

/** Current in-flight jobs, classified busy versus wedged (R16). */
export function getJobHealthSummary(now: number = Date.now()): JobHealthSummary {
  return summarizeJobHealth(_jobStartedAt.entries(), now, (name) =>
    effectiveJobTimeoutMs(name as keyof typeof JOBS),
  );
}

/**
 * Periodic cleanup hook — log jobs that remain in flight beyond the
 * scheduler safety window (2× the job timeout). Runs from the timer
 * installed by `startScheduler`.
 */
export function reportStuckJobs(log: Logger, now: number): void {
  for (const [name, startedAt] of _jobStartedAt) {
    if (now - startedAt > 2 * effectiveJobTimeoutMs(name)) {
      // Do not remove the guard while the original promise may still be
      // executing. The timeout only regains scheduler control; deleting
      // this entry here would permit overlapping side effects from an
      // uncooperative job. The owning run releases it in its promise
      // settlement handler (or the process is restarted).
      log.warn(`Job remains in flight beyond the scheduler safety window: ${name}`, {
        stuckForMs: now - startedAt,
      });
    }
  }
}

/**
 * Shutdown hook — abort every in-flight job so they stop work before the
 * database connection closes. Jobs receive SIGTERM via their signal and
 * should short-circuit within their configured timeout.
 */
export function abortActiveJobs(): void {
  for (const timeout of _activeControllers) {
    try {
      timeout.abort(new Error('scheduler: worker shutting down'));
    } catch {
      // Best-effort — the process is exiting.
    }
  }
}

export async function runJobSafely(
  name: keyof typeof JOBS,
  log: Logger,
  env?: WorkerEnv,
): Promise<void> {
  const job = JOBS[name];
  if (!job) {
    log.error(`Scheduler attempted to run unknown job: ${name}`);
    return;
  }

  // PERF-7: Guard against overlapping runs of the same job.
  if (_runningJobs.has(name)) {
    log.info(`Job ${name} skipped — previous run still in flight`);
    return;
  }
  _runningJobs.add(name);
  _jobStartedAt.set(name, Date.now());

  // OBS-02: Per-run correlation ID so all log lines from one execution can
  // be filtered together in Loki / CloudWatch / journald.
  const runId = crypto.randomUUID();
  const jobLog = log.with({ job: name, runId });

  // Acquire an idempotency lock for daily-cadence jobs.
  let lock = null;
  if (job.lock === 'daily') {
    const acquisition = await acquireJobLock(name, jobLog);
    if (acquisition.status === 'skipped') {
      jobLog.info('Job skipped - already ran today (idempotency guard)');
      _runningJobs.delete(name);
      _jobStartedAt.delete(name);
      return;
    }
    if (acquisition.status === 'error') {
      _runningJobs.delete(name);
      _jobStartedAt.delete(name);
      return;
    }
    lock = acquisition.lock;
  }

  // Race the job against a hard timeout. An abort signal alone is
  // advisory — an uncooperative job that ignores AbortSignal remains pending
  // forever. Racing a rejection promise ensures the scheduler regains control
  // after JOB_TIMEOUT_MS regardless of the job's behaviour.
  const timeout = createJobTimeout(`Job ${name}`, effectiveJobTimeoutMs(name));
  _activeControllers.add(timeout);

  jobLog.info('Running scheduled job');

  // Always create a promise before entering the race. If a job ignores its
  // abort signal, the scheduler may return after the timeout, but the in-flight
  // guard and controller remain owned until this promise actually settles.
  let jobSettled = false;
  let cleanupRequested = false;
  const cleanup = () => {
    _activeControllers.delete(timeout);
    _runningJobs.delete(name);
    _jobStartedAt.delete(name);
  };
  const requestCleanup = () => {
    cleanupRequested = true;
    if (jobSettled) cleanup();
  };
  const hcUuid =
    env && job.hcUuidEnvVar ? (env[job.hcUuidEnvVar] as string | undefined) : undefined;
  const jobPromise = Promise.resolve()
    .then(() =>
      withHeartbeat(hcUuid, () => job.run({ log: jobLog, signal: timeout.signal, tenantRouter })),
    )
    .finally(() => {
      jobSettled = true;
      if (cleanupRequested) cleanup();
    });
  // The race observes the rejection, but this explicit sink also prevents a
  // late rejection from an uncooperative timed-out job becoming unhandled.
  void jobPromise.catch(() => undefined);

  try {
    const startMs = Date.now();
    const result = await timeout.race(jobPromise);
    const durationMs = Date.now() - startMs;

    jobLog.info('Job completed successfully', {
      durationMs,
      processed: result.processed,
      note: result.note,
    });

    await lock?.done(result.note);
  } catch (err) {
    const isTimeout = timeout.timedOut();
    jobLog.error(`Job ${isTimeout ? 'timed out' : 'failed'}`, { err: String(err) });
    await lock?.fail(err);
  } finally {
    timeout.clear();
    requestCleanup();
    if (timeout.timedOut() && !jobSettled) {
      jobLog.warn('Job timed out; retaining in-flight guard until the job settles');
    }
  }
}
