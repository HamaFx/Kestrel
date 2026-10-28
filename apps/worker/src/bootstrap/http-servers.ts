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

// Worker HTTP surfaces: the `:8081` health endpoint and the optional BiQuote
// proxy server, each with listening/error reporting through the logger.

import type http from 'node:http';

import type { WorkerEnv } from '../env.js';
import { createHealthServer, createProxyServer } from '../http-server.js';
import type { Logger } from '../log.js';
import { getStuckJobSummary } from '../scheduler/job-runtime.js';
import type { WorkerRuntime } from './feed-worker';

export interface WorkerHttpServers {
  healthServer: http.Server;
  proxyServer: http.Server | null;
}

function listenOrReject(
  server: http.Server,
  port: number,
  host: string,
  log: Logger,
  label: 'Health' | 'Proxy',
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      log.info(`${label} server listening`, {
        host,
        port,
      });
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/** Create (but do not start) the health server and optional proxy server. */
export function createWorkerHttpServers({
  log,
  env,
  worker,
  tickStreamEnabled,
}: {
  log: Logger;
  env: WorkerEnv;
  worker: WorkerRuntime;
  tickStreamEnabled: boolean;
}): WorkerHttpServers {
  const healthServer = createHealthServer({
    log,
    getLastTickAt: worker.getLastTickAt,
    isSignalRConnected: worker.isSignalRConnected,
    isBinanceConnected: worker.isBinanceConnected,
    isTickStreamEnabled: () => tickStreamEnabled,
    getDroppedTicks: worker.getDroppedTicks,
    getRequestId: () => env.DEPLOYED_SHA,
    getStuckJobs: () => getStuckJobSummary().stuck,
  });

  let proxyServer: http.Server | null = null;
  if (env.BIQUOTE_PROXY_TOKEN) {
    proxyServer = createProxyServer({
      log,
      getLastTickAt: worker.getLastTickAt,
      isSignalRConnected: worker.isSignalRConnected,
      isBinanceConnected: worker.isBinanceConnected,
      isTickStreamEnabled: () => tickStreamEnabled,
      getDroppedTicks: worker.getDroppedTicks,
      getRequestId: () => env.DEPLOYED_SHA,
    });
  }

  return { healthServer, proxyServer };
}

/** Bind the created servers to their configured ports. */
export async function listenWorkerHttpServers(
  servers: WorkerHttpServers,
  { log, env }: { log: Logger; env: WorkerEnv },
): Promise<void> {
  const host = env.WORKER_HTTP_HOST ?? '127.0.0.1';

  await listenOrReject(servers.healthServer, env.WORKER_HTTP_PORT, host, log, 'Health');
  if (servers.proxyServer) {
    await listenOrReject(servers.proxyServer, env.WORKER_PROXY_PORT, host, log, 'Proxy');
  }
}
