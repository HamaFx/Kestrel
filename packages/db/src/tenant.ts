/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { and, eq, isNull } from 'drizzle-orm';

import { getDb, schema, type DbClient } from './client';

/**
 * Resolve the active organization for a user.
 *
 * The current supported OSS deployment provisions one personal organization
 * whose ID equals the user ID. The membership lookup remains authoritative so
 * this helper is ready for shared organizations without making that identity
 * assumption at every caller.
 */
export async function getTenantIdForUser(
  userId: string,
  db: DbClient = getDb(),
): Promise<string | null> {
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
