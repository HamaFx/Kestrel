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

// F5 — diagnostic context types (DEC-05 split of run-context.ts).

export interface DiagnosticStep {
  /** Step name, e.g. 'fetch_candles', 'run_technical_agent'. */
  name: string;
  /** Lifecycle status of the step. */
  status: 'started' | 'completed' | 'failed';
  /** Duration in milliseconds (set on completion/failure). */
  durationMs?: number;
  /** Auto-redacted metadata for the step. */
  metadata?: Record<string, unknown>;
  /** Timestamp the step was recorded. */
  timestamp: number;
}

export interface DiagnosticError {
  /** Error message (redacted). */
  message: string;
  /** Error name/class. */
  name: string;
  /** Stack trace (redacted), if available. */
  stack?: string;
  /** Timestamp the error was recorded. */
  timestamp: number;
}

export interface RunDiagnosticContext {
  /** Unique trace ID for this run. */
  traceId: string;
  /** User ID owning this chat turn. */
  userId: string;
  /** Thread ID for this chat turn. */
  threadId: string;
  /** HTTP request correlation id, when the run originated from a request. */
  requestId?: string;
  /** Worker/job execution id, when the run is processed asynchronously. */
  runId?: string;
  /** Durable queued analysis job id, when the run is processed asynchronously. */
  jobId?: string;
  /** Epoch timestamp the run started. */
  startedAt: number;
  /** Ordered list of steps recorded during the run. */
  steps: DiagnosticStep[];
  /** Errors recorded during the run. */
  errors: DiagnosticError[];
}

export interface DiagnosticOptions {
  /** Streamed callers persist completion from their onFinish callback. */
  deferCompletion?: boolean;
  /** Preserve a trace id supplied by a distributed worker/job boundary. */
  traceId?: string;
  /** Correlate the run with its originating HTTP request. */
  requestId?: string;
  /** Correlate the run with a worker/job execution. */
  runId?: string;
  /** Correlate the run with a durable queued analysis job. */
  jobId?: string;
}
