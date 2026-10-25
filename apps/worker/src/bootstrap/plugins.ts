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

// Plugin + durable-queue registration. Both phases log-and-continue: a
// broken plugin or queue must not take down core ingestion or cron.

import type { Logger } from '../log.js';

/**
 * Register bundled plugin capabilities before the scheduler/tick bus read
 * the host. A broken plugin must not take down core ingestion or cron.
 */
export async function registerBundledPlugins(log: Logger): Promise<void> {
  try {
    const { ensureBundledPluginsRegistered } = await import('@kestrel/plugins');
    ensureBundledPluginsRegistered();
    const { syncPluginCoreTools, syncPluginIndicators } = await import('@kestrel/ai/plugins');
    syncPluginIndicators();
    await syncPluginCoreTools();
  } catch (err) {
    log.error('plugin registration failed; continuing with core capabilities only', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Start the durable async backtest/sweep queue workers. A queue/schema
 * failure must not stop core ingestion; the synchronous backtest path keeps
 * working without it.
 */
export async function startBacktestQueues(log: Logger): Promise<void> {
  try {
    const { startBacktestQueueWorker, startBacktestSweepQueueWorker } =
      await import('../backtest-queue.js');
    await startBacktestQueueWorker(log);
    await startBacktestSweepQueueWorker(log);
    log.info('backtest and sweep queue workers registered');
  } catch (err) {
    log.warn(
      'backtest queue worker unavailable; async runs will be unavailable (sync path unaffected)',
      {
        err: err instanceof Error ? err.message : String(err),
      },
    );
  }
}
