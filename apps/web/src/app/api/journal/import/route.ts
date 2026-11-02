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

import { errorResponse, parseJsonBody, withAuth } from '@/lib/http/api';
import { importJournalEntriesService, JournalImportPayloadSchema } from '@/lib/services/journal';
import { rateLimitedResponse, withRateLimit } from '@/lib/services/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOURNAL_IMPORT_RATE_LIMIT = Number(process.env.JOURNAL_IMPORT_RATE_LIMIT) || 5;

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    // RL-5: per-user rate limit on journal imports.
    const rl = await withRateLimit(user.userId, 'journal_import', JOURNAL_IMPORT_RATE_LIMIT);
    if (!rl.allowed) {
      return rateLimitedResponse(rl);
    }
    const { trades } = await parseJsonBody(req, JournalImportPayloadSchema);
    const { count } = await importJournalEntriesService(user.userId, trades);
    return Response.json({ count });
  } catch (err) {
    return errorResponse(err);
  }
});
