/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

export const TWO_TENANT_IDS = {
  tenantA: 'user-a',
  tenantB: 'user-b',
  userA: 'user-a',
  userB: 'user-b',
  plan: '00000000-0000-4000-8000-700000000001',
  subscriptionA: '00000000-0000-4000-8000-710000000001',
  subscriptionB: '00000000-0000-4000-8000-710000000002',
  paymentA: '00000000-0000-4000-8000-720000000001',
  paymentB: '00000000-0000-4000-8000-720000000002',
} as const;

export async function seedTwoTenantBillingAndTraceData(
  execute: (query: string) => Promise<unknown>,
): Promise<void> {
  const id = TWO_TENANT_IDS;
  await execute(`
    INSERT INTO "user" ("id", "email", "name", "role") VALUES
      ('${id.userA}', 'a@example.com', 'User A', 'user'),
      ('${id.userB}', 'b@example.com', 'User B', 'user')
  `);
  await execute(`
    INSERT INTO "plans" ("id", "name", "price_usd_cents") VALUES
      ('${id.plan}', 'Pro', 1000)
  `);
  await execute(`
    INSERT INTO "subscriptions" ("id", "tenant_id", "plan_id", "status") VALUES
      ('${id.subscriptionA}', '${id.tenantA}', '${id.plan}', 'active'),
      ('${id.subscriptionB}', '${id.tenantB}', '${id.plan}', 'active')
  `);
  await execute(`
    INSERT INTO "payments" (
      "id", "subscription_id", "tenant_id", "nowpayments_payment_id",
      "nowpayments_invoice_id", "status", "pay_currency"
    ) VALUES
      ('${id.paymentA}', '${id.subscriptionA}', '${id.tenantA}', 'payment-a', 'invoice-a', 'waiting', 'usdt'),
      ('${id.paymentB}', '${id.subscriptionB}', '${id.tenantB}', 'payment-b', 'invoice-b', 'waiting', 'usdt')
  `);
  await execute(`
    INSERT INTO "diagnostic_traces" (
      "id", "user_id", "thread_id", "started_at", "status", "summary"
    ) VALUES
      ('trace-a', '${id.userA}', 'thread-a', now(), 'completed', 'A trace'),
      ('trace-b', '${id.userB}', 'thread-b', now(), 'completed', 'B trace')
  `);
}
