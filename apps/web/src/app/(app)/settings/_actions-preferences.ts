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

// Preferences domain actions — re-export barrel.
// Implementations live in sibling `_actions-preferences-*.ts` files, each
// marked with the "use server" directive; the module path stays unchanged.

export { updateProfileAction } from './_actions-preferences-profile';
export { updateUIPrefsAction } from './_actions-preferences-ui';
export { updateAiPrefsAction, updateDisabledToolsAction } from './_actions-preferences-ai';
export { updateNotificationPrefsAction } from './_actions-preferences-notifications';
export { updateUsageSettingsAction } from './_actions-preferences-usage';
export { addSymbolAction, removeSymbolAction } from './_actions-preferences-symbols';
export { updateLocaleAction } from './_actions-preferences-locale';
