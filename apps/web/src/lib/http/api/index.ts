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

// Tiny helpers shared by all `/api/*` route handlers.
// Centralises:
//   - the public error envelope shape (matches docs/05-api-routes.md)
//   - zod input parsing with a friendly 400 on failure
//   - normalised provider/AppError → HTTP mapping
//   - X-Request-Id propagation (Phase 7a)
//   - Phase A: getUserFromRequest() + withAuth() for multi-user scoping
//   - PF-10: compose() middleware chain

export { getUserFromRequest, withAuth, type RequestUser } from './auth';
export { errorResponse, type ApiErrorBody } from './errors';
export { parseJsonBody, parseSearchParams } from './body';
export { authMiddleware, compose, type Middleware } from './middleware';
