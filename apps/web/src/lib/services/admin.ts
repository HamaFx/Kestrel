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

// Admin service layer.
//
// Handles admin-only operations: user management.
//

import {
  countAdmins,
  countUsers,
  getDb,
  getDiagnosticTraceForAdmin as getDiagnosticTraceForAdminDb,
  listDiagnosticTracesForAdmin as listDiagnosticTracesForAdminDb,
  listUsersWithSettings,
  recordAdminAudit as recordAdminAuditDb,
  schema,
  updateUserRole,
  type DiagnosticTraceRow,
} from '@kestrel/db';
import { eq } from 'drizzle-orm';

import type { UserListDTO } from './admin-dtos';

// ── Service functions ────────────────────────────────────────────────────────

export async function listUsersService(
  limit: number,
  offset: number,
  q?: string,
): Promise<UserListDTO> {
  const [users, total] = await Promise.all([
    listUsersWithSettings(limit, offset, q),
    countUsers(q),
  ]);
  // Normalize DB rows to the public DTO: role defaults to 'user' and dates
  // are serialised to ISO strings so the client does not receive Date objects.
  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? 'user',
      createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
      onboardingCompleted: user.onboardingCompleted,
    })),
    total,
  };
}

export interface UpdateUserRoleInput {
  actorUserId: string;
  targetUserId: string;
  role: 'admin' | 'user';
}

export interface UpdateUserRoleResult {
  ok: true;
  previousRole: string | null;
}

export class LastAdminError extends Error {
  constructor() {
    super('Cannot demote the last admin');
  }
}

export class SelfDemoteError extends Error {
  constructor() {
    super('Cannot demote yourself');
  }
}

/**
 * Promote or demote a user. Refuses to demote the last remaining admin
 * or the current admin themself.
 *
 * Records an admin audit log entry on success.
 */
export const recordAdminAudit = recordAdminAuditDb;

export async function updateUserRoleService({
  actorUserId,
  targetUserId,
  role,
}: UpdateUserRoleInput): Promise<UpdateUserRoleResult> {
  if (actorUserId === targetUserId) {
    throw new SelfDemoteError();
  }

  const db = getDb();

  // Resolve the target user and current admin count.
  const [targetRow, adminCount] = await Promise.all([
    db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .limit(1),
    countAdmins(),
  ]);

  const target = targetRow[0];
  if (!target) {
    throw new Error('User not found');
  }

  const previousRole = target.role ?? 'user';

  // Refuse to demote the last explicit admin.
  if (role === 'user' && previousRole === 'admin' && adminCount <= 1) {
    throw new LastAdminError();
  }

  // No-op when the role is unchanged.
  if (previousRole === role) {
    return { ok: true as const, previousRole };
  }

  await updateUserRole(targetUserId, role);

  await recordAdminAudit(actorUserId, 'user.role.update', targetUserId, {
    previousRole,
    newRole: role,
  });

  return { ok: true as const, previousRole };
}

// ── Phase 3 Task 4 — admin-domain re-exports for routes ─────────────────────
//
// Audit history, cron history, diagnostics, feedback review, regression
// cases, eval datasets, user lookup, and platform settings. All callers are
// admin-gated routes.

export type { DiagnosticTraceRow };

export {
  createAuditLog,
  createUserWithSettings,
  getUserById,
  getUserRole,
  listAdminAuditLogs,
  listCronRuns,
  listFeedbackForReview,
  listTraceExplorerEvents,
  listToolTelemetry,
  reviewMessageFeedback,
} from '@kestrel/db';
export {
  getTelemetryStartupCheck,
  isMastraTelemetryDegraded,
  validateTelemetryStartup,
} from '@kestrel/ai';
export type { RunTelemetryRow } from '@kestrel/ai/mastra-v2';

/** Admin-only trace detail read after `withAdminAuth` has authorized the caller. */
export async function getDiagnosticTraceForAdmin(id: string) {
  return getDiagnosticTraceForAdminDb(id);
}

/** Admin-only cross-user trace list after `withAdminAuth` has authorized the caller. */
export async function listDiagnosticTracesForAdmin(
  opts: { threadId?: string; limit?: number } = {},
) {
  return listDiagnosticTracesForAdminDb(opts);
}
