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

// R16 (audit 2026-10-31) — cooperative yield for CPU-bound engine work.
//
// The QuickJS strategy sandbox is synchronous: once `evalCode` starts, the
// host event loop is blocked until the evaluation finishes or its interrupt
// deadline fires (5s by default). A parameter sweep evaluates the sandbox up
// to twice per combination, and awaiting an already-resolved promise only
// drains the microtask queue, so without an explicit macrotask yield a sweep
// can hold the loop for minutes while health checks, tick ingestion and cron
// jobs wait.
//
// `setImmediate` runs in the check phase of the next loop turn, so pending
// timers and I/O callbacks get to run first. `setTimeout(0)` is the fallback
// for runtimes without `setImmediate` (browsers, some workers).

export function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof setImmediate === 'function') setImmediate(resolve);
    else setTimeout(resolve, 0);
  });
}
