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

// Kestrel worker entry point.
//
// By default (`WORKER_ENABLE_TICK_STREAM=0`), the worker operates in
// 100% on-demand mode: it boots Mastra durable workflows, the job scheduler,
// and the `:8081` health endpoint without opening 24/7 SignalR/Binance
// WebSocket connections or writing to `live_ticks` / `candles_1m`.
//
// When `WORKER_ENABLE_TICK_STREAM=1` is explicitly enabled, `main()` invokes
// `runWorker()` to start the legacy SignalR + Binance streaming consumers.
//
// The bootstrap phases live in `./bootstrap/`: plugin + queue registration
// (`plugins.ts`), feed/worker startup (`feed-worker.ts`), HTTP servers
// (`http-servers.ts`), and the shutdown registry (`shutdown.ts`).

import { ensureAiBootstrapped, initLangfuse } from '@kestrel/ai';
import { ensureDataProvidersRegistered } from '@kestrel/data';
import { getCapabilityReport } from '@kestrel/shared';

import { startWorkerRuntime } from './bootstrap/feed-worker';
import {
  createWorkerHttpServers,
  listenWorkerHttpServers,
  type WorkerHttpServers,
} from './bootstrap/http-servers';
import { registerBundledPlugins, startBacktestQueues } from './bootstrap/plugins';
import { installSignalHandlers, registerPostStartupShutdown } from './bootstrap/shutdown';
import { isWorkerTickStreamEnabled, loadEnv } from './env.js';
import { createLogger } from './log.js';
import { startScheduler } from './scheduler.js';

export { onShutdown } from './bootstrap/shutdown';
export { runWorker } from './bootstrap/feed-worker';
export type { RunWorkerArgs, RunningWorker } from './bootstrap/feed-worker';

export async function main(): Promise<void> {
  ensureAiBootstrapped();
  ensureDataProvidersRegistered();
  const { loadSecretsFromVault } = await import('@kestrel/shared/vault');
  await loadSecretsFromVault();

  const env = loadEnv();
  const log = createLogger({ service: 'worker', commit: env.DEPLOYED_SHA });

  // Register bundled plugin capabilities before the scheduler/tick bus read
  // the host. A broken plugin must not take down core ingestion or cron.
  await registerBundledPlugins(log);

  // Durable async jobs. A queue/schema failure must not stop core ingestion;
  // the synchronous backtest path keeps working without it.
  await startBacktestQueues(log);

  initLangfuse({ service: 'worker' });

  const { initializeKestrelMastra } = await import('@kestrel/ai/mastra-v2');
  await initializeKestrelMastra().catch((err: unknown) => {
    log.warn('Mastra storage init failed (non-fatal; lazy init will retry)', { err: String(err) });
  });

  log.info('worker starting', {
    banner: [
      '██╗  ██╗███████╗███████╗████████╗██████╗ ███████╗██╗',
      '██║ ██╔╝██╔════╝██╔════╝╚══██╔══╝██████╔╝██╔════╝██║',
      '█████╔╝ █████╗  ███████╗   ██║   ██████╔╝█████╗  ██║',
      '██╔═██╗ ██╔══╝  ╚════██║   ██║   ██╔══██╗██╔══╝  ██║',
      '██║  ██╗███████╗███████║   ██║   ██║  ██║███████╗███████╗',
      '╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝',
    ].join('\n'),
  });

  const capabilityReport = getCapabilityReport(process.env);
  log.info('worker capabilities', {
    enabled: capabilityReport.enabled,
    disabled: capabilityReport.disabled,
  });

  const tickStreamEnabled = isWorkerTickStreamEnabled(env);
  log.info('worker starting', {
    nodeVersion: process.version,
    biquoteHubUrl: env.BIQUOTE_HUB_URL,
    healthchecksConfigured: Boolean(env.HC_SIGNALR_UUID),
    workerMode: env.WORKER_MODE,
    tickStreamEnabled,
  });

  // The scheduler stop handle is registered LAST (cleanups run in reverse
  // registration order), so in-flight jobs are aborted BEFORE the DB pool is
  // closed — otherwise a long-running job keeps issuing queries against a
  // torn-down pool during shutdown.
  let stopScheduler: (() => void) | null = null;
  if (env.WORKER_MODE === 'docker') {
    stopScheduler = startScheduler(log, env);
  }

  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { err: String(err) });
    process.exit(1);
  });

  installSignalHandlers(log);

  const worker = await startWorkerRuntime({ env, log, tickStreamEnabled });

  let servers: WorkerHttpServers | null = null;
  try {
    servers = createWorkerHttpServers({
      log,
      env,
      worker,
      tickStreamEnabled,
    });

    await listenWorkerHttpServers(servers, { log, env });

    registerPostStartupShutdown({
      healthServer: servers.healthServer,
      proxyServer: servers.proxyServer,
      worker,
      stopScheduler,
    });
  } catch (err) {
    log.error('post-startup initialisation failed — tearing down worker', { err: String(err) });
    servers?.healthServer.close();
    servers?.proxyServer?.close();
    await worker.stop();
    throw err;
  }

  log.info(
    tickStreamEnabled
      ? 'worker running — feeding live_ticks from BiQuote SignalR'
      : 'worker running — 100% on-demand BiQuote REST mode (tick stream disabled)',
  );
}

// Only run main() when invoked as the entrypoint, not when imported by tests.
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
  main().catch((err: unknown) => {
    const msg = JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'worker bootstrap failed',
      err: String(err),
    });
    process.stderr.write(msg + '\n');
    process.exit(1);
  });
}
