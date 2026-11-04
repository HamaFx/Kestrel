/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { and, eq, isNull } from 'drizzle-orm';

import { getDb, getTenantDbScope, schema, type DbClient } from '../client';

/**
 * Bounded TTL Cache for resolved memberships.
 *
 * Personal organizations use `tenantId === userId` and are immutable, and a
 * cold `withUserTenant(userId)` otherwise pays an extra `organization_member
 * ⋈ organization` round-trip before every transaction. The cache is bounded
 * (5,000 users), expires after five minutes, and is never written for missing
 * memberships, so a newly invited user is picked up on the next call.
 */
const TENANT_CACHE_MAX_ENTRIES = 5_000;
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;
const tenantIdCache = new Map<string, { tenantId: string; expiresAt: number }>();

function cachedTenantId(userId: string): string | null {
  const entry = tenantIdCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    tenantIdCache.delete(userId);
    return null;
  }
  // Refresh recency so the bounded eviction is LRU, not insert-order.
  tenantIdCache.delete(userId);
  tenantIdCache.set(userId, entry);
  return entry.tenantId;
}

function cacheTenantId(userId: string, tenantId: string): void {
  if (tenantIdCache.size >= TENANT_CACHE_MAX_ENTRIES) {
    const oldest = tenantIdCache.keys().next().value;
    if (oldest !== undefined) tenantIdCache.delete(oldest);
  }
  tenantIdCache.set(userId, { tenantId, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
}

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

  const cached = cachedTenantId(userId);
  if (cached) return cached;

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
  const tenantId = memberships[0]?.tenantId ?? null;
  if (tenantId) cacheTenantId(userId, tenantId);
  return tenantId;
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
