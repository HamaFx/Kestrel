/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Diagnostic trace query helpers — barrel for the split modules.
//
// Every name previously exported from `src/queries/diagnostic-traces.ts` is
// re-exported here so `./diagnostic-traces`, `../queries/diagnostic-traces`,
// `queries.diagnosticTraces.*` and `@kestrel/db` imports keep resolving.

export type {
  DiagnosticTraceInsert,
  DiagnosticTraceRow,
  TraceExplorerEvent,
  TraceExplorerFilters,
  TraceExplorerSource,
} from './types';
export {
  getDiagnosticTrace,
  getDiagnosticTraceForAdmin,
  listDiagnosticTraces,
  listDiagnosticTracesForAdmin,
} from './read';
export { insertDiagnosticTrace } from './write';
export { listTraceExplorerEvents } from './explorer';
