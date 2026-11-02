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

// Alert CRUD + read helpers. Used by route handlers, the cron evaluator,
// and the AI `set_alert` tool. SQL stays here so all callers see the same
// row → DTO mapping.
//
//   - types.ts           — create/update input contracts
//   - log.ts             — categorized logger
//   - rows.ts            — row → DTO mapping
//   - snooze.ts          — pure snooze gate
//   - crud.ts            — list/get/create/update/delete alerts
//   - delivery-state.ts  — delivery claims + fired-state transitions
//   - rule-state.ts      — crossing-detection state write-back

export type { CreateAlertInput, UpdateAlertInput } from './types';
export { createAlert, deleteAlert, getAlert, listAlerts, listEvaluable, updateAlert } from './crud';
export { isInSnooze } from './snooze';
export {
  claimAlertDelivery,
  markFired,
  markFiredForAlert,
  markFiredSnoozed,
  releaseAlertDeliveryClaim,
} from './delivery-state';
export { setRulePreviousValue } from './rule-state';
