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

// Phase B — Billing schema (NOWPayments / crypto).
//
// Four tables:
//   plans           — product tiers (Free, Pro, Enterprise)
//   subscriptions   — per-tenant subscription state
//   payments        — one row per IPN-confirmed payment
//   ipn_events      — idempotency + audit log for NOWPayments webhooks
//   billing_webhook_dlq — replayable failures after signature verification
//   billing_checkout_attempts — tenant-scoped checkout idempotency claims
//
// See docs/BILLING-WEBHOOK-SAFETY-GATE.md for the live operational
// acceptance criteria.

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organization } from './auth';

// ── Enums ─────────────────────────────────────────────────────────────────

export const planInterval = pgEnum('plan_interval', ['monthly', 'quarterly', 'yearly']);

export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing', // Free trial period active
  'active', // Payment confirmed, subscription in good standing
  'past_due', // Payment failed or expired, grace period
  'canceled', // User or admin canceled
  'expired', // Subscription ended, no further access
]);

export const paymentStatus = pgEnum('payment_status', [
  'waiting', // Invoice created, awaiting payment
  'confirming', // Payment received, awaiting blockchain confirmations
  'confirmed', // Confirmed on-chain
  'sending', // Payout to merchant in progress
  'finished', // Complete
  'failed', // Payment failed
  'expired', // Invoice expired without payment
  'refunded', // Refunded
]);

// ── Plans ─────────────────────────────────────────────────────────────────

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-readable name: "Free", "Pro", "Enterprise" */
    name: text('name').notNull(),
    /** NOWPayments recurring payment plan ID (null for the free tier) */
    nowpaymentsPlanId: text('nowpayments_plan_id'),
    /** Price in USD cents (for display/reference; actual charge is in crypto equivalent) */
    priceUsdCents: integer('price_usd_cents').notNull().default(0),
    /** Crypto currency the plan is billed in (e.g. 'usdt', 'btc') */
    payCurrency: text('pay_currency').default('usdt'),
    interval: planInterval('interval').notNull().default('monthly'),
    /** Feature flags gated by this plan (JSON array of feature keys) */
    features: jsonb('features').$type<string[]>().default([]),
    /** AI token/credit monthly cap (null = unlimited). Derived from monthlyCredits. */
    monthlyTokenCap: integer('monthly_token_cap'),
    /** Credits granted per billing cycle. 1 credit = $0.001. */
    monthlyCredits: bigint('monthly_credits', { mode: 'number' }).notNull().default(0),
    /** Allow pay-as-you-go top-ups beyond the plan allowance. */
    overageCredits: boolean('overage_credits').notNull().default(false),
    seatsIncluded: integer('seats_included').notNull().default(1),
    /** Stripe recurring Price.id (null for Free / NOWPayments-only). */
    stripePriceId: text('stripe_price_id'),
    stripePriceIdYearly: text('stripe_price_id_yearly'),
    visible: boolean('visible').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    trialDays: integer('trial_days').notNull().default(0),
    /** Stripe Tax behaviour for this price: 'exclusive' | 'inclusive' | 'none'. */
    stripeTaxBehavior: text('stripe_tax_behavior').default('exclusive'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('plans_name_idx').on(t.name)],
);

// ── Subscriptions ─────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** FK → organization.id (tenant = individual user) */
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** FK → plans.id */
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: subscriptionStatus('status').notNull().default('active'),
    /** NOWPayments recurring payment ID (their internal reference) */
    nowpaymentsRecurringId: text('nowpayments_recurring_id'),
    /** NOWPayments invoice ID for the most recent payment */
    nowpaymentsInvoiceId: text('nowpayments_invoice_id'),
    /** Stripe subscription object id. */
    stripeSubscriptionId: text('stripe_subscription_id'),
    /** Stripe Price.id currently attached to the subscription. */
    stripePriceId: text('stripe_price_id'),
    /** Provider that owns this subscription projection (`stripe`, `nowpayments`, `gammal`, `manual`). */
    provider: text('provider'),
    /** When the current billing period starts (Stripe anchor / UTC month). */
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    /** When the current billing period ends */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** True when Stripe will cancel at period end (status stays active). */
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    /** Audit trail for trial → active fallback. */
    trialEndPrev: timestamp('trial_end_prev', { withTimezone: true }),
    /** When the trial ends (if trialing) */
    trialEnd: timestamp('trial_end', { withTimezone: true }),
    /** Whether the user canceled (vs. system expiration) */
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    /** Last provider payment status accepted into this subscription projection. */
    lastPaymentStatus: text('last_payment_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscriptions_tenant_idx').on(t.tenantId),
    // Partial unique index: only one active/trialing subscription per tenant.
    // Allows multiple historical rows (canceled, expired, past_due) for the
    // same tenant without violating the constraint.
    uniqueIndex('subscriptions_tenant_active_idx')
      .on(t.tenantId)
      .where(sql`status IN ('active', 'trialing')`),
    uniqueIndex('subscriptions_stripe_subscription_uk')
      .on(t.stripeSubscriptionId)
      .where(sql`${t.stripeSubscriptionId} IS NOT NULL`),
  ],
);

// ── Payments (one row per IPN-confirmed payment) ──────────────────────────

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** FK → subscriptions.id (null for one-time payments) */
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    /** FK → organization.id */
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Payment provider: nowpayments | stripe | manual | promo. */
    provider: text('provider').notNull().default('nowpayments'),
    /** NOWPayments payment ID, populated by the first IPN (invoice creation returns an invoice ID). */
    nowpaymentsPaymentId: text('nowpayments_payment_id'),
    /** NOWPayments invoice ID — the stable pre-payment idempotency key. */
    nowpaymentsInvoiceId: text('nowpayments_invoice_id'),
    status: paymentStatus('status').notNull().default('waiting'),
    /** Amount paid in crypto */
    payAmount: text('pay_amount'),
    payCurrency: text('pay_currency'),
    /** USD equivalent at time of payment in cents (for accounting) */
    usdAmountCents: integer('usd_amount_cents'),
    /** Crypto transaction hash (for on-chain verification) */
    txHash: text('tx_hash'),
    /** Stripe PaymentIntent id (top-ups and one-time charges). */
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    /** Stripe Invoice id (subscription renewals). */
    stripeInvoiceId: text('stripe_invoice_id'),
    /** Gammal Tech payment link order reference (local payment UUID). */
    gammalOrderRef: text('gammal_order_ref'),
    /** Gammal Tech transaction id (`GT-TXN-...`). */
    gammalTxn: text('gammal_txn'),
    /** Gammal Tech refund notice id (`GT-RFD-...`). */
    gammalRefundTxn: text('gammal_refund_txn'),
    /** Amount charged by Gammal in the smallest unit of `gammalCurrency`. */
    gammalAmountCents: integer('gammal_amount_cents'),
    /** ISO 4217 currency charged by Gammal (USD for Kestrel plans). */
    gammalCurrency: text('gammal_currency'),
    /** How many credits this payment granted. */
    creditsGranted: bigint('credits_granted', { mode: 'number' }),
    /** Stripe billing_reason (subscription_create, subscription_cycle, …). */
    billingReason: text('billing_reason'),
    /** Raw IPN / provider webhook payload (for audit trail) */
    ipnPayload: jsonb('ipn_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_subscription_idx').on(t.subscriptionId),
    index('payments_tenant_idx').on(t.tenantId),
    index('payments_status_idx').on(t.status),
    // Phase 2 (D2-04) — match migration 0063's unique *indexes* (not UNIQUE
    // constraints) so `drizzle-kit generate` produces no drift.
    uniqueIndex('payments_nowpayments_payment_id_idx').on(t.nowpaymentsPaymentId),
    uniqueIndex('payments_nowpayments_invoice_id_idx').on(t.nowpaymentsInvoiceId),
    uniqueIndex('payments_stripe_payment_intent_uk')
      .on(t.stripePaymentIntentId)
      .where(sql`${t.stripePaymentIntentId} IS NOT NULL`),
    uniqueIndex('payments_stripe_invoice_uk')
      .on(t.stripeInvoiceId)
      .where(sql`${t.stripeInvoiceId} IS NOT NULL`),
    uniqueIndex('payments_gammal_txn_uk')
      .on(t.gammalTxn)
      .where(sql`${t.gammalTxn} IS NOT NULL`),
    uniqueIndex('payments_gammal_order_ref_uk')
      .on(t.gammalOrderRef)
      .where(sql`${t.gammalOrderRef} IS NOT NULL`),
  ],
);

// ── IPN Event Log (idempotency + audit) ───────────────────────────────────

export const ipnEvents = pgTable(
  'ipn_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NOWPayments payment ID + status = unique idempotency key */
    nowpaymentsPaymentId: text('nowpayments_payment_id').notNull(),
    paymentStatus: text('payment_status').notNull(),
    /** SHA-256 of the raw body (dedup key) */
    bodyHash: text('body_hash').notNull(),
    /** Raw JSON body */
    rawBody: jsonb('raw_body').notNull(),
    /** Whether processing completed successfully. Failed events remain replayable. */
    processed: boolean('processed').notNull().default(false),
    /** Prevents concurrent deliveries from processing the same event twice. */
    processing: boolean('processing').notNull().default(false),
    /** Lease timestamp so a crashed worker can be reclaimed safely. */
    processingAt: timestamp('processing_at', { withTimezone: true }),
    /** Error message if processing failed */
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('ipn_events_idempotency_idx').on(t.nowpaymentsPaymentId, t.paymentStatus),
    index('ipn_events_processed_idx').on(t.processed),
  ],
);

/** Replayable failures from authenticated NOWPayments webhook deliveries. */
export const billingWebhookDlq = pgTable(
  'billing_webhook_dlq',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    provider: text('provider').notNull().default('nowpayments'),
    eventType: text('event_type').notNull().default('unknown'),
    eventId: text('event_id').notNull().default('unknown'),
    payload: jsonb('payload').notNull().default({}),
    error: text('error').notNull().default('unknown'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    replayedAt: timestamp('replayed_at', { withTimezone: true }),
    replayStartedAt: timestamp('replay_started_at', { withTimezone: true }),
    replayToken: text('replay_token'),
    status: text('status').notNull().default('pending'),
  },
  (t) => [
    index('billing_webhook_dlq_status_idx').on(t.status),
    index('billing_webhook_dlq_received_at_idx').on(t.receivedAt),
    index('billing_webhook_dlq_replayed_at_idx')
      .on(t.replayedAt)
      .where(sql`${t.status} = 'replayed' AND ${t.replayedAt} IS NOT NULL`),
    uniqueIndex('billing_webhook_dlq_event_idx').on(t.provider, t.eventId, t.eventType),
  ],
);

/** Tenant-scoped idempotency claim for checkout creation. */
export const billingCheckoutAttempts = pgTable(
  'billing_checkout_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull().default('legacy'),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('pending'),
    invoiceId: text('invoice_id'),
    checkoutUrl: text('checkout_url'),
    error: text('error'),
    /** Lease for completing local work after the provider invoice exists. */
    processingAt: timestamp('processing_at', { withTimezone: true }),
    /** Random owner token prevents an expired worker overwriting a newer retry. */
    processingToken: text('processing_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('billing_checkout_attempt_tenant_key_idx').on(t.tenantId, t.idempotencyKey),
    index('billing_checkout_attempt_status_idx').on(t.status),
  ],
);

// ── Type exports ──────────────────────────────────────────────────────────

export type PlanRow = typeof plans.$inferSelect;
export type PlanInsert = typeof plans.$inferInsert;

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type SubscriptionInsert = typeof subscriptions.$inferInsert;

export type PaymentRow = typeof payments.$inferSelect;
export type PaymentInsert = typeof payments.$inferInsert;

export type IpnEventRow = typeof ipnEvents.$inferSelect;
export type IpnEventInsert = typeof ipnEvents.$inferInsert;
export type BillingWebhookDlqRow = typeof billingWebhookDlq.$inferSelect;
export type BillingCheckoutAttemptRow = typeof billingCheckoutAttempts.$inferSelect;
