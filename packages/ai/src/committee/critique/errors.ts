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

// Error classification for the critique/debate runners (DEC-05 split from
// critique.ts): transient provider failures must propagate so the workflow's
// retry handling sees them, while every other failure becomes a step marker.

import { classifyStreamError } from '../../models/fallback';

export function isTransientProviderError(error: unknown): boolean {
  const { reason } = classifyStreamError(error);
  return (
    reason === 'rate-limit' || reason === 'upstream' || reason === 'timeout' || reason === 'unknown'
  );
}
