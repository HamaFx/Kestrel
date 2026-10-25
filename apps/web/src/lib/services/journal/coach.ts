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

// PF-22 — Coach Insights service wrapper.

import { getCoachInsights, type CoachInsightsResult } from '@kestrel/ai';
import type { UserSettingsRow } from '@kestrel/db';
import type { ServerEnv } from '@kestrel/shared';

export async function getCoachInsightsService(args: {
  userId: string;
  userSettings: UserSettingsRow;
  env: ServerEnv;
  signal?: AbortSignal;
}): Promise<CoachInsightsResult> {
  return getCoachInsights({
    userId: args.userId,
    userSettings: args.userSettings,
    env: args.env,
    signal: args.signal,
  });
}
