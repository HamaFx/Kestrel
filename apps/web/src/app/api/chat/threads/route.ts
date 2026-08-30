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

// PF-22 — /api/chat/threads — list + create (thin controller).

import { z } from 'zod';

import { parseJsonBody, withAuth } from '@/lib/api';
import { createThreadService, listThreadsService } from '@/lib/services/chat';

const CreateBodySchema = z.object({ pinnedSymbol: z.string().nullable().optional() }).default({});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
  const beforeCursor = url.searchParams.get('before');
  const result = await listThreadsService(user.userId, limit, beforeCursor);
  return Response.json(result);
});

export const POST = withAuth<void>(async (req, { user }) => {
  const { pinnedSymbol } = await parseJsonBody(req, CreateBodySchema);
  const result = await createThreadService(user.userId, pinnedSymbol ?? null);
  return Response.json(result, { status: 201 });
});
