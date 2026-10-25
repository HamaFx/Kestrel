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

// XAUUSD Mastra runner facade. Research, conversation, and streaming paths
// live in focused modules; public exports are unchanged.

import { getDiagnosticContext, withDiagnostics } from '@ai/diagnostics';

import { executeXauusdMastraRun } from './research-run';
import type { RunXauusdMastraArgs, XauusdMastraRunResult } from './run-types';

export { resolveXauusdMastraModel } from './context';
export type {
  RunXauusdMastraArgs,
  XauusdMastraModel,
  XauusdMastraRunResult,
  XauusdMastraSettings,
  XauusdTurnMode,
} from './run-types';
export type { MastraToolStreamEvent } from './legacy-tool-adapter';
export {
  runXauusdMastraConversation,
  executeXauusdMastraConversationRun,
} from './conversation-run';
export {
  runXauusdMastraConversationStream,
  type XauusdMastraConversationStream,
} from './conversation-stream';

export function runXauusdMastra(args: RunXauusdMastraArgs): Promise<XauusdMastraRunResult> {
  if (getDiagnosticContext()) return executeXauusdMastraRun(args);
  return withDiagnostics(args.userId, args.threadId, () => executeXauusdMastraRun(args), {
    runId: args.runId,
    deferCompletion: false,
  });
}
