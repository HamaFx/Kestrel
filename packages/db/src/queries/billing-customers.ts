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

// Billing customer mapping (Stripe customer per tenant).

import { eq, sql } from 'drizzle-orm';

import { getAdminDb, getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';

/** Cross-tenant lookup path: BYPASSRLS when shared mode is configured. */
function lookupDb() {
  return process.env.ADMIN_DATABASE_URL ? getAdminDb() : getDb();
}

export async function getBillingCustomer(userId: string) {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);
  const [row] = await db
    .select()
    .from(schema.billingCustomers)
    .where(eq(schema.billingCustomers.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

/** Resolve the human user for a tenant (billing customer first, then member). */
export async function getBillingUserIdForTenant(tenantId: string): Promise<string | null> {
  const db = lookupDb();
  const [customer] = await db
    .select({ userId: schema.billingCustomers.userId })
    .from(schema.billingCustomers)
    .where(eq(schema.billingCustomers.tenantId, tenantId))
    .limit(1);
  if (customer?.userId) return customer.userId;
  const [member] = await db
    .select({ userId: schema.organizationMember.userId })
    .from(schema.organizationMember)
    .where(eq(schema.organizationMember.orgId, tenantId))
    .limit(1);
  return member?.userId ?? null;
}

export async function getBillingCustomerByStripeId(stripeCustomerId: string) {
  const db = lookupDb();
  const [row] = await db
    .select()
    .from(schema.billingCustomers)
    .where(eq(schema.billingCustomers.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row ?? null;
}

/** Insert-or-read the tenant row; the Stripe id is filled on first checkout. */
export async function ensureBillingCustomer(
  userId: string,
  opts: { db?: ReturnType<typeof getDb>; tenantId?: string; stripeCustomerId?: string } = {},
) {
  const db = opts.db ?? getDb();
  const tenantId = opts.tenantId ?? (await requireTenantIdForUser(userId, db));
  // Lazy insert; the tenant PK serialises concurrent checkouts.
  await db.execute(
    sql`
      INSERT INTO billing_customers (tenant_id, user_id, stripe_customer_id)
      VALUES (${tenantId}, ${userId}, ${opts.stripeCustomerId ?? null})
      ON CONFLICT (tenant_id) DO UPDATE
        SET stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, billing_customers.stripe_customer_id),
            updated_at = now()
    `,
  );
  const [row] = await db
    .select()
    .from(schema.billingCustomers)
    .where(eq(schema.billingCustomers.tenantId, tenantId))
    .limit(1);
  if (!row) throw new Error(`Billing customer row missing for tenant ${tenantId}`);
  return row;
}
