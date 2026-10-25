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

// Standalone plugin-contributed agents. Public surface unchanged; catalog,
// builder, MCP composition, runtime, and delegation live in focused modules.

export {
  hasUserAgentCatalogs,
  listUserCustomAgents,
  parseCustomAgentMention,
  resolveUserCustomAgent,
  stripCustomAgentMention,
  type CustomAgentDescriptor,
  type CustomAgentMention,
} from './agent-catalog';
export {
  buildCustomAgent,
  type BuildCustomAgentArgs,
  type BuiltCustomAgent,
  type CustomAgentEnv,
  type CustomAgentPreferences,
} from './agent-builder';
export {
  runCustomAgentStream,
  type CustomAgentStreamArgs,
  type CustomAgentStreamResult,
} from './agent-runtime';
export {
  runCustomAgentText,
  type CustomAgentTextArgs,
  type CustomAgentTextResult,
} from './agent-text-runtime';
export {
  buildCustomAgentSubagents,
  recordCustomAgentRun,
} from './subagent-delegator';
