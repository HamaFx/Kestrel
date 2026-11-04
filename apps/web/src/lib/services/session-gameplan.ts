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

// Pre-session gameplan persistence.
//
// The dashboard ritual used to write only to localStorage, so the AI risk
// context and the AI coach could not see the trader's daily R cap or rule.
// The plan now lives on `user_settings.session_gameplan`, the same row the AI
// prompt reads.

import 'server-only';

import { SessionGameplanSchema, type SessionGameplan } from '@kestrel/shared';
import { updateUserSettingsField, withUserTenant } from '@kestrel/db';

/** Validate and persist today's gameplan for the given user. */
export async function saveSessionGameplanService(
  userId: string,
  input: unknown,
): Promise<SessionGameplan> {
  const plan = SessionGameplanSchema.parse(input);
  await withUserTenant(userId, () => updateUserSettingsField(userId, 'sessionGameplan', plan));
  return plan;
}
