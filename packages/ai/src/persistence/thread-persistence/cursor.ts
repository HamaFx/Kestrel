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

// Opaque thread pagination cursor: `<updatedAt milliseconds>|<thread UUID>`.
//
// PostgreSQL timestamps have microsecond precision while JavaScript Dates have
// milliseconds, so pagination runs on the same millisecond bucket encoded in
// the cursor, with the UUID as tie-breaker inside that bucket.

import type { ThreadCursor } from './types';

export class InvalidThreadCursorError extends Error {
  readonly statusCode = 400;

  constructor() {
    super('Invalid thread pagination cursor');
    this.name = 'InvalidThreadCursorError';
  }
}

export function encodeThreadCursor(cursor: ThreadCursor): string {
  return `${cursor.updatedAt}|${cursor.id}`;
}

export function decodeThreadCursor(value: string | number | null | undefined): ThreadCursor | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value);
  const separator = raw.indexOf('|');
  const timestampText = separator === -1 ? raw : raw.slice(0, separator);
  const updatedAt = Number(timestampText);
  if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) throw new InvalidThreadCursorError();
  if (separator === -1) return { updatedAt };

  const id = raw.slice(separator + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new InvalidThreadCursorError();
  }
  return { updatedAt, id };
}
