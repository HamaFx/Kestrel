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

// Pure snooze gate used by the cron evaluator.

/**
 * Phase C — UX_UPGRADE_PLAN.md item 17. Pure snooze gate.
 *
 * Returns true when the alert is currently dormant because its
 * snooze window hasn't elapsed since the last fire. The cron
 * uses this to filter `listEvaluable` results.
 *
 * Pure function (no I/O) so it can be unit-tested without a DB.
 * Alert types are loosely typed — callers pass any object that
 * exposes `lastFiredAt` and `snoozeHours`.
 */
export function isInSnooze(
  alert: {
    lastFiredAt?: number | null | undefined;
    snoozeHours?: number | null | undefined;
  },
  now: number = Date.now(),
): boolean {
  const last = alert.lastFiredAt;
  const snooze = alert.snoozeHours ?? 0;
  if (typeof last !== 'number' || snooze <= 0) return false;
  const elapsedHours = (now - last) / 3_600_000;
  return elapsedHours < snooze;
}
