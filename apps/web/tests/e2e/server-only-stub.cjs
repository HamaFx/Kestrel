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

// Playwright's Node runner imports `@kestrel/ai/persistence`, which pulls in
// the real `server-only` package. That package throws outside a React Server
// Component graph; Vitest aliases it to a stub (`test/empty.ts`). Mirror that
// alias here so E2E specs can import server-side modules. The config loads
// this file into every worker with `NODE_OPTIONS=--require ...`.
const Module = require('node:module');

const originalLoad = Module._load;

Module._load = function load(request) {
  if (
    typeof request === 'string' &&
    (request === 'server-only' || request.includes('/server-only/'))
  ) {
    return {};
  }
  return originalLoad.apply(this, arguments);
};
