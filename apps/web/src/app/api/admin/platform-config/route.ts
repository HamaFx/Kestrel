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

// API route: /api/admin/platform-config
// Unified Admin control plane for managing platform-wide AI provider keys,
// model routing, fallback chains, per-analyst desk overrides, market data feed
// adapters, spend guardrails, and agent tool switches.

import { withAdminAuth } from '@/lib/auth/admin-auth';

import { handleGetPlatformConfig } from './_lib/get-handler';
import { handlePatchPlatformConfig } from './_lib/patch-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async (_req, { user }) => {
  return handleGetPlatformConfig(user);
});

export const PATCH = withAdminAuth(async (req, { user }) => {
  return handlePatchPlatformConfig(req, user);
});
