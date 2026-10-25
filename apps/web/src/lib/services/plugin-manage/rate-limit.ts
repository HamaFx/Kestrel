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

// Shared fixed-window guard for every Plugin Store mutation.

import { withRateLimit } from '@kestrel/db';
import { rateLimited } from '@kestrel/shared/errors';

const MANAGE_RATE_LIMIT_PER_MINUTE = 30;

export async function enforcePluginManageRateLimit(userId: string): Promise<void> {
  const limit = await withRateLimit(userId, 'plugin_manage', MANAGE_RATE_LIMIT_PER_MINUTE);
  if (!limit.allowed) {
    throw rateLimited('Too many plugin changes. Please wait a minute and try again.');
  }
}
