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

import { getDb } from '@kestrel/ai';

import { acquireCronLock } from '../cron-lock.js';
import type { WorkerEnv } from '../env.js';
import { withHeartbeat } from '../healthchecks.js';
import { JOBS } from '../jobs/index.js';
import type { Logger } from '../log.js';
import { tenantRouter } from '../tenant-router.js';
import { SKIP_DAILY_LOCK } from './skip-daily-lock.js';

// Maximum wall-clock time any scheduled job may run.
// Overridable via JOB_TIMEOUT_MS env var for jobs that need more time.
export const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS) || 120_000;

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
const _activeControllers = new Set<AbortController>();

/**
 * Periodic cleanup hook — log jobs that remain in flight beyond the
 * scheduler safety window (2× the job timeout). Runs from the timer
 * installed by `startScheduler`.
 */
export function reportStuckJobs(log: Logger, now: number): void {
  const cutoff = 2 * JOB_TIMEOUT_MS;
  for (const [name, startedAt] of _jobStartedAt) {
    if (now - startedAt > cutoff) {
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
  for (const ac of _activeControllers) {
    try {
      ac.abort(new Error('scheduler: worker shutting down'));
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
  const useLock = !SKIP_DAILY_LOCK.has(name);
  let lock = null;
  if (useLock) {
    try {
      lock = await acquireCronLock(name, getDb());
      if (!lock) {
        jobLog.info('Job skipped - already ran today (idempotency guard)');
        _runningJobs.delete(name);
        _jobStartedAt.delete(name);
        return;
      }
    } catch (lockErr) {
      // Lock acquisition failed (DB unavailable?). Retry once before
      // proceeding without the lock — a duplicate is acceptable for
      // idempotent jobs, but a missed run is worse.
      jobLog.warn('Failed to acquire cron lock, retrying once', {
        err: String(lockErr),
      });
      try {
        await new Promise((r) => setTimeout(r, 500));
        lock = await acquireCronLock(name, getDb());
        if (!lock) {
          jobLog.info('Job skipped - already ran today (idempotency guard, after retry)');
          _runningJobs.delete(name);
          _jobStartedAt.delete(name);
          return;
        }
      } catch (retryErr) {
        // Both attempts failed — fail closed to prevent concurrent duplicate execution.
        jobLog.error(
          'Failed to acquire cron lock after retry — failing closed to prevent duplicate execution',
          {
            err: String(retryErr),
          },
        );
        _runningJobs.delete(name);
        _jobStartedAt.delete(name);
        return;
      }
    }
  }

  // Race the job against a hard timeout. An abort signal alone is
  // advisory — an uncooperative job that ignores AbortSignal remains pending
  // forever. Racing a rejection promise ensures the scheduler regains control
  // after JOB_TIMEOUT_MS regardless of the job's behaviour.
  const ac = new AbortController();
  _activeControllers.add(ac);
  const timeoutMs = JOB_TIMEOUT_MS;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      ac.abort(new Error(`Job ${name} timed out after ${timeoutMs}ms`));
      reject(new Error(`Job ${name} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeoutId.unref?.();
  });

  jobLog.info('Running scheduled job');

  // Always create a promise before entering the race. If a job ignores its
  // abort signal, the scheduler may return after the timeout, but the in-flight
  // guard and controller remain owned until this promise actually settles.
  let jobSettled = false;
  let cleanupRequested = false;
  const cleanup = () => {
    _activeControllers.delete(ac);
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
      withHeartbeat(hcUuid, () => job.run({ log: jobLog, signal: ac.signal, tenantRouter })),
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
    const result = await Promise.race([jobPromise, timeoutPromise]);
    const durationMs = Date.now() - startMs;

    jobLog.info('Job completed successfully', {
      durationMs,
      processed: result.processed,
      note: result.note,
    });

    await lock?.done(result.note);
  } catch (err) {
    const isTimeout = ac.signal.aborted;
    jobLog.error(`Job ${isTimeout ? 'timed out' : 'failed'}`, { err: String(err) });
    await lock?.fail(err);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    requestCleanup();
    if (timedOut && !jobSettled) {
      jobLog.warn('Job timed out; retaining in-flight guard until the job settles');
    }
  }
}
