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

// Plugin cron jobs.
//
// Scheduled alongside the core `JOBS` registry. Each run receives only the
// users who installed + enabled the plugin; a plugin can never enumerate the
// whole tenant population. Runs are isolated, timeout-bounded, and optionally
// guarded by the shared daily cron lock.

import {
  pluginHost,
  type PluginInstalledUser,
  type RegisteredPluginJob,
} from '@kestrel/plugin-sdk';
import cron from 'node-cron';

import type { Logger } from '../log.js';
import type { CronLock } from './cron-lock.js';
import { loadInstalledPluginUsers } from './plugin-users.js';
import {
  acquireJobLock,
  createJobTimeout,
  resolveJobTimeoutMs,
  type JobTimeout,
} from './job-execution.js';

const runningJobs = new Set<string>();
const activeTimeouts = new Set<JobTimeout>();

function jobKey(job: RegisteredPluginJob): string {
  return `${job.pluginId}:${job.id}`;
}

/**
 * Schedule every registered plugin job. Returns a stop function that clears
 * timers and aborts in-flight runs.
 */
export function startPluginJobs(log: Logger): () => void {
  const tasks: ReturnType<typeof cron.schedule>[] = [];

  for (const job of pluginHost.getJobs()) {
    if (job.schedule === null) {
      log.info(`Plugin job ${jobKey(job)} has no cron schedule — skipping`);
      continue;
    }
    try {
      tasks.push(
        cron.schedule(
          job.schedule,
          () => {
            void runPluginJobSafely(job, log);
          },
          { timezone: job.timezone ?? 'UTC' },
        ),
      );
      log.info(`Scheduled plugin job ${jobKey(job)} at "${job.schedule}"`, {
        timezone: job.timezone ?? 'UTC',
      });
    } catch (err) {
      log.error(`Failed to schedule plugin job ${jobKey(job)}`, {
        schedule: job.schedule,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return () => {
    for (const task of tasks) task.stop();
    for (const timeout of activeTimeouts) {
      timeout.abort(new Error('scheduler: worker shutting down'));
    }
  };
}

async function runPluginJobSafely(job: RegisteredPluginJob, log: Logger): Promise<void> {
  const key = jobKey(job);
  if (runningJobs.has(key)) {
    log.info(`Plugin job ${key} skipped — previous run still in flight`);
    return;
  }
  runningJobs.add(key);

  const jobLog = log.with({ pluginId: job.pluginId, pluginJob: job.id });
  const timeout = createJobTimeout(`Plugin job ${key}`, resolveJobTimeoutMs());
  activeTimeouts.add(timeout);

  let lock: CronLock | null = null;
  if (job.lock === 'daily') {
    const acquisition = await acquireJobLock(`plugin:${key}`, jobLog);
    if (acquisition.status === 'skipped') {
      jobLog.info('Plugin job skipped — already ran today (idempotency guard)');
      activeTimeouts.delete(timeout);
      runningJobs.delete(key);
      return;
    }
    if (acquisition.status === 'error') {
      jobLog.error('Plugin job lock acquisition failed — skipping to avoid duplicates');
      activeTimeouts.delete(timeout);
      runningJobs.delete(key);
      return;
    }
    lock = acquisition.lock;
  }

  // Resolve once per run; the plugin may call getInstalledUsers repeatedly.
  let usersPromise: Promise<readonly PluginInstalledUser[]> | null = null;
  const getInstalledUsers = (): Promise<readonly PluginInstalledUser[]> => {
    usersPromise ??= loadInstalledPluginUsers(job.pluginId, jobLog);
    return usersPromise;
  };

  jobLog.info('Running plugin job');
  const startedAt = Date.now();
  try {
    const result = await timeout.race(
      job.run({
        pluginId: job.pluginId,
        jobId: job.id,
        log: jobLog,
        signal: timeout.signal,
        getInstalledUsers,
      }),
    );
    jobLog.info('Plugin job completed', {
      durationMs: Date.now() - startedAt,
      processed: result.processed,
      ...(result.note ? { note: result.note } : {}),
    });
    await lock?.done(result.note);
  } catch (err) {
    jobLog.error('Plugin job failed', {
      durationMs: Date.now() - startedAt,
      err: err instanceof Error ? err.message : String(err),
    });
    await lock?.fail(err);
  } finally {
    timeout.clear();
    activeTimeouts.delete(timeout);
    runningJobs.delete(key);
  }
}
