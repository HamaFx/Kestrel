/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { and, eq, isNull } from 'drizzle-orm';

import { getDb, getTenantDbScope, schema, type DbClient } from './client';

/**
 * Resolve the active organization for a user.
 *
 * Short-circuits to the active `AsyncLocalStorage` tenant scope when it was
 * entered for the same user (or when the tenant id itself equals the user id,
 * the personal-org convention). Inside `withTenantDbFresh(tenantId, ..., {
 * userId })`, every repository call would otherwise re-run the
 * `organization_member ⋈ organization` join for a tenant we already resolved.
 *
 * The membership lookup stays authoritative for any other user id — notably an
 * admin route inspecting a different user must not inherit the admin's tenant.
 */
export async function getTenantIdForUser(
  userId: string,
  db: DbClient = getDb(),
): Promise<string | null> {
  if (!userId) return null;
  const scope = getTenantDbScope();
  if (scope && (scope.userId === userId || scope.tenantId === userId)) {
    return scope.tenantId;
  }

  const memberships = await db
    .select({ tenantId: schema.organizationMember.orgId })
    .from(schema.organizationMember)
    .innerJoin(
      schema.organization,
      and(
        eq(schema.organization.id, schema.organizationMember.orgId),
        eq(schema.organizationMember.userId, userId),
        isNull(schema.organization.deletedAt),
      ),
    )
    .where(eq(schema.organizationMember.userId, userId))
    .limit(2);

  if (memberships.length > 1) {
    throw new Error(`Multiple active organization memberships found for user ${userId}`);
  }
  return memberships[0]?.tenantId ?? null;
}

/**
 * Resolve a user's tenant or fail closed when membership is missing.
 * User-facing writes should use this rather than copying userId into tenantId.
 */
export async function requireTenantIdForUser(
  userId: string,
  db: DbClient = getDb(),
): Promise<string> {
  const tenantId = await getTenantIdForUser(userId, db);
  if (!tenantId) throw new Error(`No organization membership found for user ${userId}`);
  return tenantId;
}
