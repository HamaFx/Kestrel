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

// Legacy-path re-export. TS, esbuild and Node ESM resolve the
// `../signalr/consumer.js` specifiers used across `src/` (tick buffer,
// binance consumer, live-ticks persistence, candle aggregator, bootstrap)
// only to a real file, never to `./consumer/index.ts`. The implementation
// now lives in `./consumer/`; this module keeps the historical import path
// working.

export * from './consumer/index.js';
