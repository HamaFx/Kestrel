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

// Shared job execution primitives: the wall-clock timeout race and the
// daily cron-lock acquisition policy used by the scheduler, plugin jobs, and
// the one-shot runner CLI.

import { getDb } from '@kestrel/db';

import type { Logger } from '../log.js';
import { acquireCronLock, type CronLock } from './cron-lock.js';

const DEFAULT_JOB_TIMEOUT_MS = 120_000;

/** Per-job override wins over the current process-wide env default. */
export function resolveJobTimeoutMs(override?: number): number {
  return override ?? (Number(process.env.JOB_TIMEOUT_MS) || DEFAULT_JOB_TIMEOUT_MS);
}

export interface JobTimeout {
  readonly signal: AbortSignal;
  timedOut(): boolean;
  abort(reason?: unknown): void;
  clear(): void;
  /** Race a promise against the timeout rejection. */
  race<T>(promise: Promise<T>): Promise<T>;
}

const DEFAULT_TIMEOUT_GRACE_MS = 5 * 60_000;
export { DEFAULT_TIMEOUT_GRACE_MS as JOB_TIMEOUT_GRACE_MS };

/**
 * One timeout authority for a job attempt. The abort signal is advisory and
 * the rejection race guarantees the caller regains control even when the job
 * ignores it.
 */
export function createJobTimeout(label: string, timeoutMs: number): JobTimeout {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      const error = new Error(`${label} timed out after ${timeoutMs}ms`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    timeoutId.unref?.();
  });

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    abort: (reason?: unknown) => controller.abort(reason ?? new Error(`${label} aborted`)),
    clear: () => {
      if (timeoutId) clearTimeout(timeoutId);
    },
    race: <T>(promise: Promise<T>) => Promise.race([promise, timeoutPromise]),
  };
}

export type CronLockAcquisition =
  | { status: 'acquired'; lock: CronLock }
  | { status: 'skipped' }
  | { status: 'error' };

const LOCK_RETRY_DELAY_MS = 500;

/**
 * Acquire the daily idempotency lock. A transient DB failure is retried once;
 * a second failure fails closed so two runners cannot execute the same daily
 * job concurrently.
 */
export async function acquireJobLock(name: string, log: Logger): Promise<CronLockAcquisition> {
  try {
    const lock = await acquireCronLock(name, getDb());
    return lock ? { status: 'acquired', lock } : { status: 'skipped' };
  } catch (err) {
    log.warn('Failed to acquire cron lock, retrying once', { err: String(err) });
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    const lock = await acquireCronLock(name, getDb());
    return lock ? { status: 'acquired', lock } : { status: 'skipped' };
  } catch (err) {
    log.error('Failed to acquire cron lock after retry — failing closed', {
      err: String(err),
    });
    return { status: 'error' };
  }
}
