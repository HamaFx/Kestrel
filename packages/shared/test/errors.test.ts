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

import { describe, expect, it } from 'vitest';

import {
  AppError,
  budgetExceeded,
  conflict,
  ERROR_CODES,
  forbidden,
  formatErrorResponse,
  internalError,
  notFound,
  providerUnavailable,
  rateLimited,
  unauthorized,
  validationError,
  type ErrorCode,
} from '../src';

describe('ERROR_CODES', () => {
  it('exposes the 9 stable error codes in canonical order', () => {
    expect(ERROR_CODES).toEqual([
      'VALIDATION',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'CONFLICT',
      'NOT_FOUND',
      'RATE_LIMITED',
      'PROVIDER_UNAVAILABLE',
      'BUDGET_EXCEEDED',
      'INTERNAL',
    ]);
    expect(ERROR_CODES.length).toBe(9);
  });
});

describe('AppError', () => {
  it('stores code, message, status, and details', () => {
    const err = new AppError('VALIDATION', 'Invalid input', 400, { field: 'symbol' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('Invalid input');
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ field: 'symbol' });

    const withoutDetails = new AppError('NOT_FOUND', 'Not found', 404);
    expect(withoutDetails.details).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
describe('error factories', () => {
  it.each<{
    label: string;
    make: () => AppError;
    code: ErrorCode;
    status: number;
    message: string;
    details?: unknown;
  }>([
    {
      label: 'validationError',
      make: () => validationError('Symbol is required', { symbol: 'XAUUSD' }),
      code: 'VALIDATION',
      status: 400,
      message: 'Symbol is required',
      details: { symbol: 'XAUUSD' },
    },
    {
      label: 'validationError without details',
      make: () => validationError('Symbol is required'),
      code: 'VALIDATION',
      status: 400,
      message: 'Symbol is required',
    },
    {
      label: 'unauthorized with default message',
      make: () => unauthorized(),
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Unauthorized',
    },
    {
      label: 'unauthorized with custom message',
      make: () => unauthorized('Invalid API key'),
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Invalid API key',
    },
    {
      label: 'forbidden with default message',
      make: () => forbidden(),
      code: 'FORBIDDEN',
      status: 403,
      message: 'Forbidden',
    },
    {
      label: 'forbidden with custom message',
      make: () => forbidden('Insufficient permissions'),
      code: 'FORBIDDEN',
      status: 403,
      message: 'Insufficient permissions',
    },
    {
      label: 'notFound with default message',
      make: () => notFound(),
      code: 'NOT_FOUND',
      status: 404,
      message: 'Not found',
    },
    {
      label: 'conflict with details',
      make: () => conflict('Already exists', { id: 'abc' }),
      code: 'CONFLICT',
      status: 409,
      message: 'Already exists',
      details: { id: 'abc' },
    },
    {
      label: 'rateLimited with default message',
      make: () => rateLimited(),
      code: 'RATE_LIMITED',
      status: 429,
      message: 'Too Many Requests',
    },
    {
      label: 'providerUnavailable with details',
      make: () => providerUnavailable('BiQuote returned 500', { provider: 'biquote' }),
      code: 'PROVIDER_UNAVAILABLE',
      status: 503,
      message: 'BiQuote returned 500',
      details: { provider: 'biquote' },
    },
    {
      label: 'budgetExceeded with default message',
      make: () => budgetExceeded(),
      code: 'BUDGET_EXCEEDED',
      status: 503,
      message: 'Daily AI budget exceeded',
    },
    {
      label: 'internalError with details',
      make: () => internalError('Unexpected error', { cause: 'timeout' }),
      code: 'INTERNAL',
      status: 500,
      message: 'Unexpected error',
      details: { cause: 'timeout' },
    },
    {
      label: 'internalError with defaults',
      make: () => internalError(),
      code: 'INTERNAL',
      status: 500,
      message: 'Internal error',
    },
  ])('$label creates an AppError', ({ make, code, status, message, details }) => {
    const err = make();

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
    if (details === undefined) {
      expect(err.details).toBeUndefined();
    } else {
      expect(err.details).toEqual(details);
    }
  });
});

// ---------------------------------------------------------------------------
// formatErrorResponse
// ---------------------------------------------------------------------------
describe('formatErrorResponse', () => {
  it('formats AppError as JSON response with matching status', async () => {
    const err = new AppError('VALIDATION', 'Bad request', 400, { field: 'symbol' });
    const res = formatErrorResponse(err);
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({
      error: { code: 'VALIDATION', message: 'Bad request', details: { field: 'symbol' } },
    });
  });

  it('includes requestId when provided', async () => {
    const err = validationError('Invalid');
    const res = formatErrorResponse(err, { requestId: 'req-123' });
    const body = await res.json();
    expect(body.error.requestId).toBe('req-123');
  });

  it('includes extra headers from options', () => {
    const err = validationError('Invalid');
    const res = formatErrorResponse(err, { headers: { 'X-Custom': 'value' } });
    expect(res.headers.get('X-Custom')).toBe('value');
  });

  it('formats non-AppError as generic 500 INTERNAL', async () => {
    const res = formatErrorResponse(new Error('Something broke'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'INTERNAL', message: 'Internal error' } });
  });

  it('formats unknown (non-Error) as generic 500', async () => {
    const res = formatErrorResponse('string error');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'INTERNAL', message: 'Internal error' } });
  });

  it('formats AppError without details correctly', async () => {
    const err = unauthorized();
    const res = formatErrorResponse(err);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  });
});
