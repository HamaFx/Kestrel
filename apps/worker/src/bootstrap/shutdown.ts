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

// Graceful-shutdown registry: signal handlers, cleanup ordering, and the
// post-startup registrations that tie the servers/feeds/DB pool together.

import { shutdownLangfuse } from '@kestrel/ai';
import { closeDb } from '@kestrel/db';

import type { Logger } from '../log.js';
import type { RunningWorker } from './feed-worker';

interface ShutdownState {
  shuttingDown: boolean;
  /** Cleanup callbacks run in reverse-registration order on shutdown. */
  cleanups: Array<() => Promise<void> | void>;
}

const state: ShutdownState = { shuttingDown: false, cleanups: [] };

export function installSignalHandlers(log: Logger): void {
  const handle = (signal: NodeJS.Signals): void => {
    if (state.shuttingDown) {
      log.warn('second signal received — exiting immediately', { signal });
      process.exit(1);
      return;
    }
    state.shuttingDown = true;
    log.info('shutdown signal received', { signal });

    void (async () => {
      // Run cleanups in reverse order so dependencies tear down first.
      for (let i = state.cleanups.length - 1; i >= 0; i -= 1) {
        try {
          await state.cleanups[i]?.();
        } catch (err) {
          log.error('cleanup failed', { err: String(err) });
        }
      }
      log.info('shutdown complete');
      process.exit(0);
    })();
  };

  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
}

/** Register a cleanup callback to run on graceful shutdown. */
export function onShutdown(fn: () => Promise<void> | void): void {
  state.cleanups.push(fn);
}

interface PostStartupShutdownArgs {
  healthServer: { close: () => void };
  proxyServer: { close: () => void } | null;
  worker: Pick<RunningWorker, 'stop'>;
  stopScheduler: (() => void) | null;
}

/**
 * Register the post-startup shutdown ordering. Callbacks run in reverse —
 * so registering the producers (scheduler + feeds) AFTER the observability
 * flushes means: abort jobs → stop feeds/servers → flush observability →
 * close the DB pool last.
 */
export function registerPostStartupShutdown({
  healthServer,
  proxyServer,
  worker,
  stopScheduler,
}: PostStartupShutdownArgs): void {
  onShutdown(() => closeDb());
  // Registered after closeDb so reverse-order shutdown stops the queue
  // BEFORE the database pool disappears.
  onShutdown(async () => {
    const { stopQueue } = await import('@kestrel/db/queue');
    await stopQueue();
  });

  onShutdown(() => shutdownLangfuse());
  onShutdown(async () => {
    const { flushMastraObservability, getKestrelMastra } = await import('@kestrel/ai/mastra-v2');
    await flushMastraObservability(getKestrelMastra().instance).catch(() => {});
  });
  // Cleanups run in reverse registration order. Registering the producers
  // (scheduler + feeds) AFTER the observability flushes means: abort jobs →
  // stop feeds/servers → flush observability → close the DB pool last.
  onShutdown(() => {
    healthServer.close();
    proxyServer?.close();
    return worker.stop();
  });
  if (stopScheduler) onShutdown(stopScheduler);
}
