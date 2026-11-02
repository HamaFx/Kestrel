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

// Phase 3 Task 4 — explicit low-level database access for gated routes.
//
// This module is deliberately NOT a convenience barrel: it exists so the
// handful of admin-gated diagnostics, health probes, and import/export
// handlers that genuinely need the raw client or the tenant-scope wrappers
// have an honest, named home. Business logic belongs in the domain services
// (chat, settings, market, journal, admin, ...), never here.

import 'server-only';

export { getAdminDb, getDb, requireTenantIdForUser, schema, withAdminDb } from '@kestrel/db';
