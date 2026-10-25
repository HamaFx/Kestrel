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

import { createPluginExecutionContext } from '@kestrel/ai/plugins';
import { getDb, listEnabledPluginUsers } from '@kestrel/db';
import {
  pluginHost,
  type PluginInstalledUser,
  type RegisteredPluginJob,
} from '@kestrel/plugin-sdk';
import { decryptPluginSettings } from '@kestrel/plugin-sdk/settings';
import cron from 'node-cron';

import { acquireCronLock } from './cron-lock.js';
import type { Logger } from './log.js';

const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS) || 120_000;

const runningJobs = new Set<string>();
const activeControllers = new Set<AbortController>();

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
    for (const controller of activeControllers) {
      controller.abort(new Error('scheduler: worker shutting down'));
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
  const controller = new AbortController();
  activeControllers.add(controller);

  const useLock = job.lock === 'daily';
  let lock: Awaited<ReturnType<typeof acquireCronLock>> = null;
  if (useLock) {
    try {
      lock = await acquireCronLock(`plugin:${key}`, getDb());
      if (!lock) {
        jobLog.info('Plugin job skipped — already ran today (idempotency guard)');
        runningJobs.delete(key);
        activeControllers.delete(controller);
        return;
      }
    } catch (err) {
      jobLog.error('Plugin job lock acquisition failed — skipping to avoid duplicates', {
        err: err instanceof Error ? err.message : String(err),
      });
      runningJobs.delete(key);
      activeControllers.delete(controller);
      return;
    }
  }

  // Resolve once per run; the plugin may call getInstalledUsers repeatedly.
  let usersPromise: Promise<readonly PluginInstalledUser[]> | null = null;
  const getInstalledUsers = (): Promise<readonly PluginInstalledUser[]> => {
    usersPromise ??= loadInstalledUsers(job.pluginId, jobLog);
    return usersPromise;
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(new Error(`Plugin job ${key} timed out after ${JOB_TIMEOUT_MS}ms`));
      reject(new Error(`Plugin job ${key} timed out after ${JOB_TIMEOUT_MS}ms`));
    }, JOB_TIMEOUT_MS);
    timeoutId.unref?.();
  });

  jobLog.info('Running plugin job');
  const startedAt = Date.now();
  try {
    const result = await Promise.race([
      job.run({
        pluginId: job.pluginId,
        jobId: job.id,
        log: jobLog,
        signal: controller.signal,
        getInstalledUsers,
      }),
      timeoutPromise,
    ]);
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
    if (timeoutId) clearTimeout(timeoutId);
    activeControllers.delete(controller);
    runningJobs.delete(key);
  }
}

async function loadInstalledUsers(
  pluginId: string,
  log: Logger,
): Promise<readonly PluginInstalledUser[]> {
  try {
    const rows = await listEnabledPluginUsers(pluginId);
    const manifest = pluginHost.getPlugin(pluginId)?.manifest;
    return rows.map((row) => {
      const settings = decryptPluginSettings(manifest?.settingsSchema, row.settings ?? {});
      const ctx = createPluginExecutionContext({
        userId: row.userId,
        tenantId: row.tenantId,
        pluginId,
        settings,
      });
      return {
        userId: row.userId,
        tenantId: row.tenantId,
        settings,
        storage: ctx.storage,
      };
    });
  } catch (err) {
    log.error('Failed to resolve plugin installed users', {
      pluginId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
