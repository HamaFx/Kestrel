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

// Node-runtime only: keep this file out of the instrumentation module's static
// import graph. Next's edge compiler analyses instrumentation.ts eagerly and
// warns about `process.on` even when the call sits behind a runtime check.

/**
 * Node surfaces a client vanishing mid-response (mobile backgrounding,
 * browser navigation, preview proxy restart) as `Error: aborted` with
 * `code: ECONNRESET`. Next's dev server logs every uncaughtException through
 * its original-stack formatter, which makes those expected disconnects look
 * like application faults. Filter that exact shape in development and forward
 * everything else to the listeners Next installed.
 */
export function installExpectedDisconnectFilter(): void {
  if (process.env.NODE_ENV === 'production') return;
  const globalState = globalThis as typeof globalThis & {
    __kestrelDisconnectFilterInstalled?: boolean;
  };
  if (globalState.__kestrelDisconnectFilterInstalled) return;

  const existing = process.listeners('uncaughtException');
  if (existing.length === 0) return;

  globalState.__kestrelDisconnectFilterInstalled = true;
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', (err) => {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ECONNRESET' && err.message === 'aborted') return;
    for (const listener of existing) listener(err, 'uncaughtException');
  });
}
