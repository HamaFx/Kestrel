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

import { sleep } from 'k6';

import type { SessionCtx } from '../config/environments.js';
import { marketStreamEvents, marketStreamTtfb } from '../lib/metrics.js';
import { getSseStream } from '../lib/sse.js';

export function marketStreamSse(_ctx?: SessionCtx): void {
  const stream = getSseStream('/api/market/stream?symbols=XAUUSD,EURUSD', 'market_stream', 5000);
  marketStreamTtfb.add(stream.ttfbMs);
  marketStreamEvents.add(stream.parsed.eventCount);
  sleep(1);
}
