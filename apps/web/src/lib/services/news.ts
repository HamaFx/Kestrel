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

// Phase 3 Task 4 — news ingestion + embedding service boundary.
//
// Article fetch/upsert, the high-water mark used by the news cron, and the
// embedding backfill. Route handlers import these instead of `@kestrel/ai`
// and `@kestrel/data` directly.

import 'server-only';

export {
  backfillEmbeddings,
  countPendingEmbeddings,
  latestArticleTimestampMs,
  listRecentArticles,
  upsertArticles,
} from '@kestrel/ai';
export { fetchNews } from '@kestrel/data';
