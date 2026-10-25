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

// Diagnostic trace row shapes and the admin trace-explorer event contract.

import type { schema } from '../../client';

export type DiagnosticTraceRow = typeof schema.diagnosticTraces.$inferSelect;
export type DiagnosticTraceInsert = typeof schema.diagnosticTraces.$inferInsert;

export interface TraceExplorerFilters {
  /** Optional owner scope. Omit only for an authenticated admin caller. */
  userId?: string | undefined;
  traceId?: string | undefined;
  runId?: string | undefined;
  jobId?: string | undefined;
  threadId?: string | undefined;
  messageId?: string | undefined;
  limit?: number | undefined;
}

export type TraceExplorerSource = 'trace' | 'turn' | 'tool' | 'agent' | 'budget' | 'outbox';

export interface TraceExplorerEvent {
  id: string;
  source: TraceExplorerSource;
  timestamp: Date;
  name: string;
  status: string;
  traceId: string | null;
  runId: string | null;
  jobId: string | null;
  threadId: string | null;
  messageId: string | null;
  userId: string | null;
  durationMs: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}
