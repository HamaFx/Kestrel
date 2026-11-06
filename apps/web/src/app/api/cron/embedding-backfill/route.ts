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

// GET /api/cron/embedding-backfill — finds news_articles without embeddings
// and embeds them in batches via the AI Gateway. Capped per run so it stays
// under Vercel's function timeout regardless of backlog.
//
// this route is a manual-fallback path. The scheduled invocation
// runs as the optional worker `embedding-backfill` job, where it is not bound
// by the 60s function ceiling.

import { withCronAuth } from '@/lib/http/cron';
import { backfillNewsEmbeddingsService } from '@/lib/services/news';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () =>
    backfillNewsEmbeddingsService(req.signal ? { signal: req.signal } : {}),
  );
}
