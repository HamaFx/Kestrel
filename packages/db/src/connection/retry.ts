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

// Transient-error retry for database operations, keyed on SQLSTATE classes.

/**
 * Retry a database operation on transient errors (connection drops,
 * serialization failures, deadlocks). Uses exponential backoff.
 *
 * postgres-js surfaces PostgreSQL errors with a `code` property
 * containing the SQLSTATE value. We check SQLSTATE classes rather
 * than error message strings for reliability across postgres-js
 * versions and locale settings (H5 fix — RELIABILITY_AUDIT_REPORT.md).
 *
 * SQLSTATE classes:
 *   08xxx  — connection exceptions
 *   40P01  — deadlock detected
 *   40001  — serialization failure
 *   57Pxx  — admin shutdown / operator intervention
 *   53300  — too many connections
 *   58P01  — cannot connect to database
 *
 * @param fn — the operation to retry
 * @param maxRetries — max retry attempts (default 3, for 4 total attempts)
 * @param baseDelayMs — initial delay before first retry (default 100ms)
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;

      const code = extractSqlState(err);

      // Retry on SQLSTATE classes:
      //   08xxx — connection exception (connection dropped, broken)
      //   40P01 — deadlock detected
      //   40001 — serialization failure
      //   57Pxx — operator intervention (admin shutdown, restart)
      //   53300 — too many connections
      const retryable =
        code !== null &&
        (code.startsWith('08') ||
          code === '40P01' ||
          code === '40001' ||
          code.startsWith('57') ||
          code === '53300');

      if (!retryable) {
        // Known non-retryable SQLSTATE — throw immediately.
        if (code !== null) throw err;
        // No SQLSTATE code available — fall back to legacy string-matching
        // on error messages (postgres-js may wrap the original error).
        const msg = err instanceof Error ? err.message : String(err);
        if (
          !msg.includes('connection') &&
          !msg.includes('timeout') &&
          !msg.includes('deadlock') &&
          !msg.includes('serialization') &&
          !msg.includes('could not serialize') &&
          !msg.includes('Connection terminated') &&
          !msg.includes('Connection reset') &&
          !msg.includes('connect ECONNREFUSED') &&
          !msg.includes('connect ETIMEDOUT') &&
          !msg.includes('read ECONNRESET')
        ) {
          throw err;
        }
      }

      // Full jitter (mirrors packages/ai/src/retry.ts): aligned exponential
      // delays across instances turn a recovering Postgres into a
      // reconnect storm.
      const delay = Math.random() * baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Extract the SQLSTATE code from a postgres-js error.
 * postgres-js errors have a `code` property (e.g., '08P01', '40P01').
 */
function extractSqlState(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Record<string, unknown>;
  if (typeof e.code === 'string' && e.code.length === 5) return e.code;
  return null;
}
