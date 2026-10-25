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

// Alert CRUD input contracts. SQL stays in `crud.ts` so all callers see the
// same row → DTO mapping.

import type { AlertChannel, AlertRule } from '@kestrel/shared';

export interface CreateAlertInput {
  userId: string;
  rule: AlertRule;
  channels?: AlertChannel[];
  note?: string | null;
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 17. Snooze window in
   * hours (0..168). 0 = one-shot (legacy). Default 0 so
   * existing callers don't need to change.
   */
  snoozeHours?: number;
}

export interface UpdateAlertInput {
  rule?: AlertRule | undefined;
  channels?: AlertChannel[] | undefined;
  note?: string | null | undefined;
  active?: boolean | undefined;
  /** Pass `null` to re-arm a fired alert. */
  firedAt?: number | null | undefined;
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 17. Update the snooze
   * window. Validation mirrors the schema (0..168). Pass
   * `undefined` to leave unchanged.
   */
  snoozeHours?: number | undefined;
}
