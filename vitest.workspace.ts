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

import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/ai/vitest.config.ts',
  'packages/data/vitest.config.ts',
  'packages/db/vitest.config.ts',
  'packages/indicators/vitest.config.ts',
  'packages/shared/vitest.config.ts',
  'packages/test-utils/vitest.config.ts',
  'apps/web/vitest.config.ts',
  'apps/worker/vitest.config.ts',
]);
