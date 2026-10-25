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

// Age-based retention policy applied by `storage.prune()`.

import type { RetentionConfig } from '@mastra/core/storage';

/**
 * Retention policies for growth tables (age-based; applied by
 * `storage.prune()` from a maintenance job — not yet wired in Phase 0).
 * Keys are validated against `DomainRetentionTables` at compile time.
 */
export function mastraRetention(): RetentionConfig {
  return {
    memory: {
      messages: { maxAge: '90d' },
      threads: { maxAge: '180d' },
      // Audit v2 §4.4 (P2-4) — resources are user-scoped working memory, so
      // they get the longest age window rather than thread-lifetime pruning.
      resources: { maxAge: '365d' },
    },
    workflows: {
      workflowSnapshot: { maxAge: '30d' },
    },
    backgroundTasks: {
      backgroundTasks: { maxAge: '30d' },
    },
    schedules: {
      triggers: { maxAge: '90d' },
    },
  };
}
