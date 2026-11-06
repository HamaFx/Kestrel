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

// GET /api/cron/cleanup-uploads — deletes chat-attachment blobs older than the
// retention window from the private `chat-images` bucket.
//
// the previous version listed bare `YYYY-MM-DD`
// prefixes, but objects are written to `<userId>/<YYYY-MM-DD>/<file>`, so it
// matched nothing and `RETENTION_DAYS` was decorative. The sweep now lives in
// `lib/http/upload-cleanup.ts` and walks the same layout the uploader builds.
//
// R7 follow-up: an upload referenced by a journal entry survives the sweep.
// `journal-references.ts` loads those references from the database on the
// admin connection, scoped to the day folders being swept; its bound is what
// the `journalDeferredUsers` count in the response reports.
//
// Triggered by an external daily scheduler (Vercel Cron or operator cron)
// that pokes this route with CRON_SECRET.

import { getServerEnv } from '@/lib/env';
import { withCronAuth } from '@/lib/http/cron';
import { runUploadCleanup, UPLOAD_RETENTION_DAYS } from '@/lib/http/upload-cleanup';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { loadJournalReferences } from '@/lib/services/journal/references';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'cleanup-uploads' });
  return withCronAuth(req, async () => {
    const env = getServerEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        processed: 0,
        note: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipped',
      };
    }

    const summary = await runUploadCleanup({
      supabaseUrl: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      loadJournalReferences,
      warn: (message, fields) => log.warn(message, fields ?? {}),
    });

    const result = {
      processed: summary.deleted,
      // Human-readable line for the systemd journal / cron runner. The
      // structured fields below are what a monitor should alert on.
      note:
        `deleted=${summary.deleted} journalKept=${summary.journalReferencedKept} ` +
        `journalDeferredUsers=${summary.journalUsersDeferred} errors=${summary.errors} ` +
        `users=${summary.usersScanned} dayFolders=${summary.dayFoldersSwept}/` +
        `${summary.dayFoldersExpired} cutoff=${summary.cutoffDay}` +
        ` retentionDays=${UPLOAD_RETENTION_DAYS}${summary.truncated ? ' truncated=true' : ''}`,
      ...summary,
    };
    return result;
  });
}
