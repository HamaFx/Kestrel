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

// Stack-frame extraction shared by structured logging and bug reports. It
// lives in `errors/` rather than `logger/` so the bug-report module can use it
// without creating a logger ↔ bug-report import cycle.

/** Best-effort parse of file/line from a stack trace. */
export function parseStack(stack: string | undefined): { file?: string; line?: number } {
  if (!stack) return {};
  const match = stack.split('\n')[1]?.match(/\((.+):(\d+):\d+\)/);
  if (match && match[1] && match[2]) {
    const file = match[1];
    const line = Number(match[2]);
    return { file, line };
  }
  // Fallback for stacks without parentheses
  const fallback = stack.split('\n')[1]?.match(/at\s+(.+):(\d+):\d+/);
  if (fallback && fallback[1] && fallback[2]) {
    const file = fallback[1];
    const line = Number(fallback[2]);
    return { file, line };
  }
  return {};
}
