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

// SPDX-License-Identifier: Apache-2.0

// Public error envelope shape (matches docs/05-api-routes.md) and normalised
// provider/AppError → HTTP mapping.

import { ProviderError, toAppError } from '@kestrel/data';
import { AppError, formatErrorResponse, validationError, type ErrorCode } from '@kestrel/shared';
import { ZodError } from 'zod';

import { createScopedLoggerWithContext } from '../../logger';
import { REQUEST_ID_HEADER } from '../request-id';
import { readRequestId, routeTag } from './request-context';

export interface ApiErrorBody {
  error: {
    code: ErrorCode | 'VALIDATION';
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * Standardised error response. Pass `req` to echo the X-Request-Id header
 * (and embed it in the error body so the UI can show it in a bug report).
 */
export function errorResponse(err: unknown, req?: Request): Response {
  const requestId = readRequestId(req);
  const headers: Record<string, string> = {};
  if (requestId) headers[REQUEST_ID_HEADER] = requestId;
  const options = { ...(requestId ? { requestId } : {}), headers };
  const route = routeTag(req);

  if (err instanceof AppError) {
    if (err.status >= 500) {
      createScopedLoggerWithContext({ component: 'api', route, requestId }).errorContext(
        err,
        'app error',
        { code: err.code },
      );
    }
    return formatErrorResponse(err, options);
  }
  if (err instanceof ProviderError) {
    createScopedLoggerWithContext({ component: 'api', route, requestId }).errorContext(
      err,
      'provider error',
      { provider: err.provider },
    );
    return formatErrorResponse(toAppError(err), options);
  }
  if (err instanceof ZodError) {
    return formatErrorResponse(validationError('Invalid request', err.flatten()), options);
  }

  // PF-22: Handle rate-limit and validation errors thrown from service
  // functions as plain Error objects with a numeric `statusCode` property.
  if (
    err instanceof Error &&
    typeof (err as unknown as Record<string, unknown>).statusCode === 'number'
  ) {
    const statusCode = (err as unknown as Record<string, unknown>).statusCode as number;
    const extraHeaders = (err as unknown as Record<string, unknown>).headers as
      Record<string, string> | undefined;
    return Response.json(
      {
        error: {
          code: statusCode === 429 ? 'RATE_LIMITED' : 'VALIDATION',
          message: err.message,
          ...(requestId ? { requestId } : {}),
        },
      },
      { status: statusCode, headers: { ...headers, ...extraHeaders } },
    );
  }
  createScopedLoggerWithContext({ component: 'api', route, requestId }).error(
    { err: String(err) },
    'unhandled error',
  );
  return formatErrorResponse(err, options);
}
