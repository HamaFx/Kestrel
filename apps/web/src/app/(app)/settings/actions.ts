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

// Settings server actions — re-export barrel.
//
// Implementations live under `_actions/` (Phase 3 Task 3 flattened the
// former 2-layer `_actions-*.ts` pyramid). Import paths remain unchanged:
// `from '../actions'` still works everywhere.

export type { ActionResult, SaveKeysResult } from './_actions/shared';

// Security
export {
  setupTwoFactorAction,
  verifyTwoFactorAction,
  regenerateBackupCodesAction,
  disableTwoFactorAction,
} from './_actions/security-two-factor';
export {
  listSessionsAction,
  revokeSessionAction,
  signOutEverywhereAction,
} from './_actions/security-sessions';
export { changePasswordAction } from './_actions/security-password';
export { deleteAccountAction } from './_actions/security-account';

// API keys
export { updateApiKeysAction } from './_actions/api-keys-save';
export { exportKeysAction, importKeysAction } from './_actions/api-keys-transfer';
export { updateMarketDataProviderAction } from './_actions/api-keys-market';

// Preferences
export { updateProfileAction } from './_actions/preferences-profile';
export { updateUIPrefsAction } from './_actions/preferences-ui';
export { updateAiPrefsAction, updateDisabledToolsAction } from './_actions/preferences-ai';
export { updateNotificationPrefsAction } from './_actions/preferences-notifications';

// Data
export { clearChatHistoryAction } from './_actions/data-clear';
export { exportDataAction } from './_actions/data-export';

// Onboarding
export { resetOnboardingAction } from './_actions/onboarding';
