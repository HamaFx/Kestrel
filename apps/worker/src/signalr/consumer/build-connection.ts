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

// Production connection factory for the BiQuote SignalR consumer.

import { DEFAULT_RECONNECT_DELAYS } from '../reconnect.js';
import type { BuildConnection, MinimalHubConnection } from './types.js';

/**
 * Production factory: builds a real SignalR HubConnection. Imported lazily
 * via `await import('@microsoft/signalr')` so unit tests don't need the
 * package installed and so the worker startup doesn't pay the cost on the
 * hot path.
 */
export async function createDefaultBuildConnection(): Promise<BuildConnection> {
  const mod = await import('@microsoft/signalr');
  const { HubConnectionBuilder } = mod;

  return ({ hubUrl, reconnectDelaysMs }) => {
    const conn = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect(reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS)
      .build();
    return conn as unknown as MinimalHubConnection;
  };
}
