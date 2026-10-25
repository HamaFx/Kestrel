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

// Process-wide reset for every packet cache instance (test support).

import { cacheRegistry } from './factory';
import { resetRedisMirrorState } from './redis-mirror';

/** Test helper — clear the in-process LRU. */
export function _resetPacketCache(): void {
  for (const cache of cacheRegistry) cache.reset();
  // Mirror state too, so each test case re-resolves its own REDIS_URL/mock.
  resetRedisMirrorState();
}
