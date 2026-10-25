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

// Machine-readable log lines for AI agent consumption.

import { generateBugReport, redactDiagnosticPayload } from '../bug-report';
import { getCurrentCorrelation, type LogCategory } from './context';
import { logger } from './pino';

/** Shape of data passed to logForAgent. */
export interface AgentLogData {
  error?: unknown;
  module: string;
  category: LogCategory;
  context?: Record<string, unknown>;
  suggestedFix?: string;
  relatedFiles?: string[];
}

/**
 * Produce a log line specifically formatted for AI agent consumption.
 * The resulting log line has `agentLog: true` so agents can filter with
 * `grep '"agentLog":true'`.
 */
export function logForAgent(
  level: 'error' | 'warn' | 'info',
  operation: string,
  data: AgentLogData,
): void {
  const correlation = getCurrentCorrelation();
  const report = data.error
    ? generateBugReport(data.error, {
        operation,
        module: data.module,
        trace: correlation,
      })
    : null;

  logger[level](
    {
      agentLog: true,
      operation,
      module: data.module,
      category: data.category,
      ...correlation,
      ...(report ? { bugReport: report } : {}),
      ...(redactDiagnosticPayload(data.context ?? {}) as Record<string, unknown>),
      ...(data.suggestedFix ? { suggestedFix: data.suggestedFix } : {}),
      ...(data.relatedFiles ? { relatedFiles: data.relatedFiles } : {}),
    },
    operation,
  );
}
