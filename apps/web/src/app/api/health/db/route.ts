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

// Phase 8 — Task 39: Database health check endpoint
//
// Verifies:
//   1. Database connectivity (SELECT 1)
//   2. Migration count matches the expected number from the journal
//
// Returns 200 if both checks pass, 503 if either fails.

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/http/api';
import { getDatabaseHealth } from '@/lib/services/health/db-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async () => {
  const result = await getDatabaseHealth();
  const httpStatus = result.ok ? 200 : 503;

  return NextResponse.json(
    { status: result.ok ? 'ok' : 'error', ts: new Date().toISOString(), ...result },
    { status: httpStatus },
  );
});
