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

// BiQuote SignalR consumer barrel. Every name previously exported from
// `src/signalr/consumer.ts` is re-exported here so `./consumer.js`,
// `../signalr/consumer.js` and `./consumer/index.js` imports keep
// resolving unchanged.

export { SignalRConsumer } from './connection.js';
export { createDefaultBuildConnection } from './build-connection.js';
export type {
  BuildConnection,
  BuildConnectionArgs,
  ConsumerOptions,
  MinimalHubConnection,
  NormalizedTick,
} from './types.js';
