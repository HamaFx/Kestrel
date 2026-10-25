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

// Structured logger — barrel for the split modules.
//
// Split by domain group: categories + correlation stores in
// `./logger/context`, the pino instance/destination in `./logger/pino`,
// structured error logging in `./logger/errors`, the categorized logger in
// `./logger/categorized`, and the agent log lines in `./logger/agent`.
//
// Every name previously exported from `src/logger.ts` is re-exported here so
// `@kestrel/shared/logger`, `./logger` and `../logger` imports keep resolving —
// and the `traceIdStorage` / `runIdStorage` singletons stay single instances.

export {
  LOG_CATEGORIES,
  requestIdStorage,
  runIdStorage,
  traceIdStorage,
  type LogCategory,
} from './logger/context';
export { createPinoLogger, createScopedLogger, logger } from './logger/pino';
export { logErrorContext } from './logger/errors';
export { createCategorizedLogger, type CategorizedLogger } from './logger/categorized';
export { logForAgent, type AgentLogData } from './logger/agent';
