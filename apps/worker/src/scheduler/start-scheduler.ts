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

// Scheduler with idempotency guards and per-job timeouts.
//
// Jobs whose cadence is >= daily use once-per-day idempotency via
// acquireCronLock (STAB-01). Minute-level jobs (alerts, briefings) are
// inherently idempotent and skip the lock.
//
// STAB-02: Every job run races against a 60-second AbortController. The
// signal is threaded into JobContext so individual jobs can short-circuit
// long loops.

import { ensureBundledPluginsRegistered } from '@kestrel/plugins';
import cron from 'node-cron';

import type { WorkerEnv } from '../env.js';
import { JOBS } from '../jobs/index.js';
import type { Logger } from '../log.js';
import { startPluginJobs } from '../plugin-jobs.js';
import { cleanupStaleCronRuns } from './cleanup-cron-runs.js';
import { abortActiveJobs, reportStuckJobs, runJobSafely } from './job-runtime.js';

export function startScheduler(log: Logger, env?: WorkerEnv): () => void {
  // Keep references to all scheduled tasks so we can stop
  // them on shutdown. Previously these were fire-and-forget.
  const tasks: ReturnType<typeof cron.schedule>[] = [];
  let multiAgentTimer: NodeJS.Timeout | null = null;
  let stopPluginJobs: (() => void) | null = null;

  log.info('Starting node-cron scheduler for Docker mode');

  // WK-2: Clean up stale cron_runs rows from previous crashes before
  // the first timer fires. Do not allow a failed cleanup to become an
  // unhandled rejection during worker bootstrap.
  if (
    process.env.NODE_ENV !== 'test' &&
    process.env.KESTREL_LOCAL_DOCKER !== 'true' &&
    process.env.KESTREL_LOCAL_DOCKER_LEGACY !== 'true'
  ) {
    void cleanupStaleCronRuns(log);
  }

  // PF-04 — Schedule all jobs from the JOBS registry.
  // Iterates the registry and sets up cron for every entry with a
  // non-null schedule. Multi-agent-analysis uses setTimeout below.
  const jobEntries = Object.entries(JOBS) as Array<
    [keyof typeof JOBS, (typeof JOBS)[keyof typeof JOBS]]
  >;
  for (const [name, job] of jobEntries) {
    if (job.schedule === null) {
      log.info(`Job ${name} has no cron schedule — skipping cron registration`);
      continue;
    }
    tasks.push(
      // All job schedules are documented in UTC; pin the timezone explicitly
      // instead of relying on the host's TZ (Docker defaults to UTC today,
      // but nothing enforces it).
      cron.schedule(
        job.schedule,
        () => {
          void runJobSafely(name, log, env);
        },
        { timezone: 'UTC' },
      ),
    );
    log.info(`Scheduled job ${name} at "${job.schedule}"`);
  }

  // Plugin cron jobs run alongside core JOBS. Registration is idempotent;
  // a faulty plugin must not prevent core jobs from being scheduled.
  try {
    ensureBundledPluginsRegistered();
    stopPluginJobs = startPluginJobs(log);
  } catch (err) {
    log.error('Plugin job registration failed; core jobs continue', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // U2 — Multi-agent analysis: poll every 3 seconds for pending jobs.
  // PERF-7: Self-rescheduling setTimeout avoids pile-up when a poll
  // exceeds 3s. The next tick is scheduled only after the current one
  // settles (including DB transit + claim time).
  const tick = () => {
    void runJobSafely('multi-agent-analysis', log, env).finally(() => {
      multiAgentTimer = setTimeout(tick, 3_000);
      multiAgentTimer.unref();
    });
  };
  // Kick off the first tick at the configured interval (3s), not immediately.
  multiAgentTimer = setTimeout(tick, 3_000);
  multiAgentTimer.unref();

  // Periodic cleanup — scan for stuck jobs that exceed 2× the
  // timeout. If a run throws synchronously between _runningJobs.add() and
  // the try block's finally, the entry remains forever. This timer prunes
  // stale entries so the job can run again on its next schedule.
  const stuckCleanupTimer = setInterval(() => {
    reportStuckJobs(log, Date.now());
  }, 30_000);
  stuckCleanupTimer.unref();

  // Return a stop function that tears down all cron tasks,
  // the multi-agent poll timer, and the stuck-job cleanup timer.
  // In-flight jobs are aborted and allowed a bounded drain window.
  return () => {
    log.info('scheduler: stopping all tasks');
    clearInterval(stuckCleanupTimer);
    if (multiAgentTimer) {
      clearTimeout(multiAgentTimer);
      multiAgentTimer = null;
    }
    for (const t of tasks) t.stop();
    stopPluginJobs?.();
    // Abort every in-flight job so they stop work before the database
    // connection closes. Jobs receive SIGTERM via their signal and should
    // short-circuit within their configured timeout.
    abortActiveJobs();
  };
}
