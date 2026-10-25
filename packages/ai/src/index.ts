// RULE-R02 — importing this barrel has no side effects. App entrypoints
// (web instrumentation, worker main, tests) call `ensureAiBootstrapped()`.
export { ensureAiBootstrapped } from './runtime/services';

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

// Public barrel for @kestrel/ai. The route handler imports from here.
// Export blocks are grouped by domain in `./barrels/*` and re-exported here
// so the public surface is unchanged.
export * from './barrels/budget';
export * from './barrels/agents';
export * from './barrels/tools';
export * from './barrels/runtime';
export * from './barrels/data';
export * from './barrels/eval';
