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

// Categorized logger: injects `category` + correlation ids into every line.

import type { Writable } from 'node:stream';

import { getCurrentCorrelation, type LogCategory } from './context';
import { logErrorContext } from './errors';
import { createPinoLogger, logger } from './pino';

/** Log method overloads: string-first or pino-style object-first. */
export interface CategorizedLogger {
  trace(msg: string, meta?: Record<string, unknown>): void;
  trace(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  info(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  error(obj: Record<string, unknown>, msg: string): void;
  errorContext: (err: unknown, operation: string, ctx?: Record<string, unknown>) => void;
}

/**
 * Create a categorized logger that automatically injects the `category`
 * field and the current `traceId` (if inside a diagnostic scope) into
 * every log line.
 */
export function createCategorizedLogger(
  category: LogCategory,
  additionalContext: Record<string, unknown> = {},
  destination?: Writable,
): CategorizedLogger {
  const base = destination ? createPinoLogger(destination) : logger;
  const child = base.child({ category, ...additionalContext });

  function log(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
    msgOrObj: string | Record<string, unknown>,
    metaOrMsg?: Record<string, unknown> | string,
  ): void {
    const traceMeta = getCurrentCorrelation();

    if (typeof msgOrObj === 'string') {
      // string-first: log.info('msg', { meta })
      const meta = typeof metaOrMsg === 'object' && metaOrMsg !== null ? metaOrMsg : undefined;
      child[level]({ ...traceMeta, ...(meta ?? {}) }, msgOrObj);
    } else {
      // object-first: log.info({ meta }, 'msg')
      const msg = typeof metaOrMsg === 'string' ? metaOrMsg : '';
      child[level]({ ...traceMeta, ...msgOrObj }, msg);
    }
  }

  return {
    trace: (
      msgOrObj: string | Record<string, unknown>,
      metaOrMsg?: Record<string, unknown> | string,
    ) => log('trace', msgOrObj, metaOrMsg),
    debug: (
      msgOrObj: string | Record<string, unknown>,
      metaOrMsg?: Record<string, unknown> | string,
    ) => log('debug', msgOrObj, metaOrMsg),
    info: (
      msgOrObj: string | Record<string, unknown>,
      metaOrMsg?: Record<string, unknown> | string,
    ) => log('info', msgOrObj, metaOrMsg),
    warn: (
      msgOrObj: string | Record<string, unknown>,
      metaOrMsg?: Record<string, unknown> | string,
    ) => log('warn', msgOrObj, metaOrMsg),
    error: (
      msgOrObj: string | Record<string, unknown>,
      metaOrMsg?: Record<string, unknown> | string,
    ) => log('error', msgOrObj, metaOrMsg),
    errorContext: (err, operation, ctx = {}) => {
      logErrorContext(err, operation, ctx, category);
    },
  };
}
