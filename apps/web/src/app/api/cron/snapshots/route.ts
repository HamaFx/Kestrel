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

// GET /api/cron/snapshots — daily HLOC, pivots, ATR, key levels per symbol.
//
// Calls the shared `runSnapshotRefresh` runner, which also tail-prunes
// `candles_1m` to the trailing retention window.

import { withCronAuth } from '@/lib/http/cron';
import { runSnapshotsCronService } from '@/lib/services/cron-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => runSnapshotsCronService());
}
