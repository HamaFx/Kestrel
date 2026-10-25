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

// Pino instance, destination and factory helpers.
//
// Importing this module constructs the process-wide `logger` (a pino instance
// writing to stdout and the log stream hub) — the same side effect the previous
// single-file logger module had at import time.

import { Writable } from 'node:stream';

import pino from 'pino';

// Import here to avoid circular dependency issues at module top level.
import { logStreamHub } from '../log-stream';

// Define a default base config for our structured logger
const isDevelopment = process.env.NODE_ENV === 'development';

// NOTE: We intentionally avoid pino-pretty / transport here because
// Next.js webpack/Turbopack cannot safely bundle thread-stream's worker
// file ("vendor-chunks/lib/worker.js"). For pretty-printed dev logs,
// pipe the output: pnpm dev | npx pino-pretty

/** Custom pino destination that forwards log lines to stdout and the log stream hub. */
class TeeDestination extends Writable {
  private streamingEnabled: boolean;

  constructor() {
    super();
    this.streamingEnabled = logStreamHub.isEnabled();
  }

  override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const line =
      typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    process.stdout.write(line, (err) => {
      if (this.streamingEnabled) {
        logStreamHub.write(line.trimEnd());
      }
      callback(err ?? undefined);
    });
  }
}

function buildPinoOptions() {
  return {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    // Automatically inject default context bindings, but omit pid/hostname to save bytes in JSON
    ...(isDevelopment ? { base: null } : {}),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'hashedPassword',
        'email',
        'token',
        'keys',
        'aiApiKeys',
        // Expanded redaction
        '*.password',
        '*.hashedPassword',
        '*.token',
        '*.secret',
        '*.apiKey',
        '*.apiKeys',
        '*.aiApiKeys',
        '*.privateKey',
        '*.authorization',
        '*.cookie',
        '*.sessionToken',
        '*.refreshToken',
        '*.accessToken',
        '*.clientSecret',
        '*.webhook',
        '*.encryptionKey',
        'error.context.apiKey',
        'error.context.token',
        'error.context.secret',
        'error.context.authorization',
      ],
      censor: '[REDACTED]',
    },
  };
}

export const logger = pino(buildPinoOptions(), new TeeDestination());

/** Create a fresh pino instance wired to the given Writable destination. */
export function createPinoLogger(destination: Writable): pino.Logger {
  return pino(buildPinoOptions(), destination);
}

/**
 * Creates a child logger with scoped context.
 * Useful for attaching `userId` or `threadId` to all subsequent logs in a flow.
 */
export function createScopedLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
