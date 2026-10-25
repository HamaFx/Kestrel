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

// Plugin Store runtime bootstrap + logger.
//
// Populate nav/widget metadata on the server too, so the Store can show
// "Open" links and sidebar-tab badges without a client round-trip.

import { ensureBundledPluginsRegistered } from '@kestrel/plugins';
import { registerBundledPluginUi } from '@kestrel/plugins/ui';
import { createCategorizedLogger } from '@kestrel/shared/logger';

registerBundledPluginUi();
// Defensive: instrumentation normally registers the capability host first.
// A route invoked without that boot path (CLI, isolated test, cold chunk)
// must still see the bundled plugins.
try {
  ensureBundledPluginsRegistered();
} catch (err) {
  console.error('[plugin-manage] bundled plugin registration failed', err);
}

export const plog = createCategorizedLogger('api', { component: 'plugin-manage' });
