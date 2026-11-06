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

// Structured error logging enriched with error-pattern metadata.

// Import here to avoid circular dependency issues at module top level.
import { redactDiagnosticPayload } from '../errors/bug-report';
import { findErrorPattern } from '../errors/error-patterns';
import { parseStack } from '../errors/stack';
import { getCurrentCorrelation, type LogCategory } from './context';
import { logger } from './pino';

export { parseStack } from '../errors/stack';

/** Build a structured error object for logging. */
function buildErrorObject(err: unknown): Record<string, unknown> {
  const errorObj = err as {
    message?: string;
    name?: string;
    code?: string;
    stack?: string;
    cause?: unknown;
  };
  const stackInfo = parseStack(errorObj?.stack);
  const error: Record<string, unknown> = {
    name: errorObj?.name ?? 'Error',
    message: errorObj?.message ?? String(err),
  };
  if (errorObj?.code) error['code'] = errorObj.code;
  if (errorObj?.stack) error['stack'] = errorObj.stack.slice(0, 2000);
  if (stackInfo.file !== undefined) error['file'] = stackInfo.file;
  if (stackInfo.line !== undefined) error['line'] = stackInfo.line;
  if (errorObj?.cause) {
    error['cause'] = String(errorObj.cause).slice(0, 500);
  }
  return error;
}

/**
 * Log a structured error with context. Automatically enriches the log line
 * with error pattern metadata (suggestedFix, relatedFiles, retryable) and
 * the current traceId if inside a diagnostic scope.
 */
export function logErrorContext(
  err: unknown,
  operation: string,
  context: Record<string, unknown> = {},
  category: LogCategory = 'system',
): void {
  const correlation = getCurrentCorrelation();
  const pattern = findErrorPattern(err);
  const error = buildErrorObject(err);

  logger.error(
    {
      category,
      operation,
      ...correlation,
      error,
      ...(redactDiagnosticPayload(context) as Record<string, unknown>),
      ...(pattern
        ? {
            suggestedFix: pattern.suggestedFix,
            relatedFiles: pattern.relatedFiles,
            retryable: pattern.retryable,
            errorPattern: pattern.description,
          }
        : {}),
    },
    `${operation} failed`,
  );
}
