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

// Credit wallet engine — the only write path for `credit_wallets`.
//
// Invariants (plan §4):
//   - Balances are bigint credits, 1 credit = $0.001, and never negative.
//   - Every money movement writes exactly one `credit_ledger` row keyed by a
//     stable idempotency key.
//   - Mutations use `UPDATE … RETURNING` (and `FOR UPDATE` when a decision
//     depends on the current balance), so web + worker writes serialise.
//
// Callers inside a request should let `requireTenantIdForUser` resolve the
// tenant; worker/cron callers pass an explicit `tenantId` and the BYPASSRLS
// admin client.

import { and, asc, desc, eq, like, lt, ne, sql } from 'drizzle-orm';

import { getAdminDb, getDb, hasTenantDbScope, type DbClient } from '../client';
import { requireTenantIdForUser } from '../tenant';
import { schema } from '../client';
import type { CreditLedgerKind } from '../schema/credit-ledger';

export interface CreditWallet {
  userId: string;
  tenantId: string;
  availableCredits: number;
  lifetimeGranted: number;
  lifetimeConsumed: number;
  updatedAt: Date;
}

export interface CreditMutationResult {
  ledgerId: string;
  balanceAfter: number;
  /** False when the idempotency key already existed. */
  applied: boolean;
}

export interface CreditReservationResult {
  ok: boolean;
  reservationId: string | null;
  balanceAfter: number;
  required: number;
  /** True when a reservation with the same idempotency key already existed. */
  idempotent: boolean;
}

export interface ReconcileResult {
  reconciled: boolean;
  actualCredits: number;
  balanceAfter: number;
  /** Positive when the actual charge exceeded the available balance. */
  shortfallCredits: number;
}

type Db = DbClient;
type CreditDb = Pick<DbClient, 'execute'>;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function asNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function utcMonthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

async function resolveTenant(userId: string, db: CreditDb, tenantId?: string): Promise<string> {
  return tenantId ?? (await requireTenantIdForUser(userId, db as DbClient));
}

/** Read a wallet, returning null when the user has never had one. */
export async function getWallet(
  userId: string,
  opts: { db?: Db; tenantId?: string } = {},
): Promise<CreditWallet | null> {
  const db = opts.db ?? getDb();
  const tenantId = await resolveTenant(userId, db, opts.tenantId);
  const [row] = await db
    .select()
    .from(schema.creditWallets)
    .where(and(eq(schema.creditWallets.userId, userId), eq(schema.creditWallets.tenantId, tenantId)))
    .limit(1);
  if (!row) return null;
  return {
    userId: row.userId,
    tenantId: row.tenantId,
    availableCredits: asNumber(row.availableCredits),
    lifetimeGranted: asNumber(row.lifetimeGranted),
    lifetimeConsumed: asNumber(row.lifetimeConsumed),
    updatedAt: row.updatedAt,
  };
}

/**
 * Insert the wallet row if missing. Safe to call on every read path.
 * Returns the current wallet.
 */
export async function ensureWallet(
  userId: string,
  opts: { db?: Db; tenantId?: string } = {},
): Promise<CreditWallet> {
  const db = opts.db ?? getDb();
  const tenantId = await resolveTenant(userId, db, opts.tenantId);
  await db.execute(
    sql`
      INSERT INTO credit_wallets (user_id, tenant_id, available_credits)
      VALUES (${userId}, ${tenantId}, 0)
      ON CONFLICT (user_id) DO NOTHING
    `,
  );
  const wallet = await getWallet(userId, { db, tenantId });
  if (!wallet) throw new Error(`Credit wallet could not be created for user ${userId}`);
  return wallet;
}

interface GrantArgs {
  userId: string;
  amountCredits: number;
  kind: CreditLedgerKind;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  db?: CreditDb;
  tenantId?: string;
}

/**
 * Apply a signed credit movement exactly once.
 *
 * Positive amounts grant; negative amounts consume/expire/adjust. Negative
 * movements clamp at zero — the CHECK constraint is a backstop, not the
 * primary guard. The ledger records the amount actually applied.
 */
export async function grantCredits(args: GrantArgs): Promise<CreditMutationResult> {
  const amount = Math.trunc(args.amountCredits);
  if (!Number.isFinite(amount)) throw new Error('Credit amount must be finite');
  const db = args.db ?? getDb();
  const tenantId = await resolveTenant(args.userId, db, args.tenantId);

  const run = async (tx: CreditDb): Promise<CreditMutationResult> => {
    await tx.execute(
      sql`
        INSERT INTO credit_wallets (user_id, tenant_id, available_credits)
        VALUES (${args.userId}, ${tenantId}, 0)
        ON CONFLICT (user_id) DO NOTHING
      `,
    );
    const walletRows = rowsOf<{ available_credits: number | string }>(
      await tx.execute(
        sql`
          SELECT available_credits FROM credit_wallets
          WHERE user_id = ${args.userId} AND tenant_id = ${tenantId}
          FOR UPDATE
        `,
      ),
    );
    const balance = asNumber(walletRows[0]?.available_credits);
    const newBalance = Math.max(0, balance + amount);
    const applied = newBalance - balance;

    const ledgerRows = rowsOf<{ id: string; balance_after: number | string | null }>(
      await tx.execute(
        sql`
          INSERT INTO credit_ledger
            (tenant_id, user_id, kind, amount_credits, balance_after,
             idempotency_key, reference_type, reference_id, metadata)
          VALUES (
            ${tenantId}, ${args.userId}, ${args.kind}, ${applied}, ${newBalance},
            ${args.idempotencyKey}, ${args.referenceType ?? null}, ${args.referenceId ?? null},
            ${JSON.stringify(args.metadata ?? {})}::jsonb
          )
          ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
          RETURNING id, balance_after
        `,
      ),
    );
    const ledger = ledgerRows[0];
    if (!ledger) {
      const existing = rowsOf<{ id: string; balance_after: number | string | null }>(
        await tx.execute(
          sql`
            SELECT id, balance_after FROM credit_ledger
            WHERE tenant_id = ${tenantId} AND idempotency_key = ${args.idempotencyKey}
            LIMIT 1
          `,
        ),
      );
      return {
        ledgerId: existing[0]?.id ?? '',
        balanceAfter: asNumber(existing[0]?.balance_after) || balance,
        applied: false,
      };
    }

    await tx.execute(
      sql`
        UPDATE credit_wallets
        SET available_credits = ${newBalance},
            lifetime_granted = lifetime_granted + ${applied > 0 ? applied : 0},
            lifetime_consumed = lifetime_consumed + ${args.kind === 'consumption' && applied < 0 ? -applied : 0},
            updated_at = now()
        WHERE user_id = ${args.userId} AND tenant_id = ${tenantId}
      `,
    );

    return { ledgerId: ledger.id, balanceAfter: newBalance, applied: true };
  };

  if (args.db) return run(args.db);
  // Inside a request/worker tenant transaction the scoped client is already
  // a transaction; starting a nested one is not portable across drivers.
  if (hasTenantDbScope()) return run(getDb());
  return getDb().transaction((tx) => run(tx));
}

/** Grant positive credits (subscription/top-up/promo/admin). */
export async function addCredits(
  args: Omit<GrantArgs, 'amountCredits' | 'kind'> & {
    amountCredits: number;
    kind?: Extract<CreditLedgerKind, 'subscription_grant' | 'topup_grant' | 'promo_grant' | 'admin_adjustment' | 'refund'>;
  },
): Promise<CreditMutationResult> {
  return grantCredits({ ...args, amountCredits: Math.abs(args.amountCredits), kind: args.kind ?? 'admin_adjustment' });
}

/** Expire unused subscription credits at a period boundary (D4). */
export async function expireCredits(args: {
  userId: string;
  amountCredits: number;
  idempotencyKey: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  db?: CreditDb;
  tenantId?: string;
}): Promise<CreditMutationResult> {
  return grantCredits({
    ...args,
    amountCredits: -Math.abs(args.amountCredits),
    kind: 'expiration',
  });
}

/** Legacy-compatible explicit consumption write (no reservation). */
export async function consumeCredits(args: {
  userId: string;
  amountCredits: number;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  db?: CreditDb;
  tenantId?: string;
}): Promise<CreditMutationResult> {
  return grantCredits({ ...args, amountCredits: -Math.abs(args.amountCredits), kind: 'consumption' });
}

/**
 * Reserve credits before a model call.
 *
 * The guarded `UPDATE … WHERE available >= required` is the admission
 * decision. The reservation and ledger row are written in the same
 * transaction, so a crash cannot debit without a recoverable record.
 */
export async function reserveCredits(args: {
  userId: string;
  estimateCredits: number;
  idempotencyKey: string;
  threadId?: string;
  traceId?: string;
  runId?: string;
  jobId?: string;
  /** Record the reservation without debiting the wallet (shadow metering). */
  shadow?: boolean;
  db?: CreditDb;
  tenantId?: string;
}): Promise<CreditReservationResult> {
  const required = Math.max(0, Math.ceil(args.estimateCredits));
  const db = args.db ?? getDb();
  const tenantId = await resolveTenant(args.userId, db, args.tenantId);

  const run = async (tx: CreditDb): Promise<CreditReservationResult> => {
    await tx.execute(
      sql`
        INSERT INTO credit_wallets (user_id, tenant_id, available_credits)
        VALUES (${args.userId}, ${tenantId}, 0)
        ON CONFLICT (user_id) DO NOTHING
      `,
    );

    // Serialise on the wallet before the idempotency check. Two concurrent
    // retries of the same turn both wait here; the loser observes the row the
    // winner committed instead of debiting twice.
    const lockedWallet = rowsOf<{ available_credits: number | string }>(
      await tx.execute(
        sql`
          SELECT available_credits FROM credit_wallets
          WHERE user_id = ${args.userId} AND tenant_id = ${tenantId}
          FOR UPDATE
        `,
      ),
    );
    const balanceBefore = asNumber(lockedWallet[0]?.available_credits);

    const existingRows = rowsOf<{
      id: string;
      reserved_credits: number | string;
      status: string;
      shadow: boolean;
    }>(
      await tx.execute(
        sql`
          SELECT id, reserved_credits, status, shadow FROM credit_reservations
          WHERE tenant_id = ${tenantId} AND idempotency_key = ${args.idempotencyKey}
          LIMIT 1
        `,
      ),
    );
    if (existingRows[0]) {
      return {
        ok: existingRows[0].shadow || existingRows[0].status === 'reserved',
        reservationId: existingRows[0].id,
        balanceAfter: balanceBefore,
        required,
        idempotent: true,
      };
    }

    if (required === 0) {
      return {
        ok: true,
        reservationId: null,
        balanceAfter: balanceBefore,
        required: 0,
        idempotent: false,
      };
    }

    if (args.shadow) {
      const shadowRows = rowsOf<{ id: string }>(
        await tx.execute(
          sql`
            INSERT INTO credit_reservations
              (tenant_id, user_id, thread_id, trace_id, run_id, job_id,
               reserved_credits, status, shadow, idempotency_key)
            VALUES (
              ${tenantId}, ${args.userId},
              ${args.threadId ?? null}, ${args.traceId ?? null}, ${args.runId ?? null}, ${args.jobId ?? null},
              ${required}, 'reserved', true, ${args.idempotencyKey}
            )
            RETURNING id
          `,
        ),
      );
      const shadowId = shadowRows[0]?.id;
      if (!shadowId) throw new Error('Shadow credit reservation insert returned no id');
      await tx.execute(
        sql`
          INSERT INTO credit_ledger
            (tenant_id, user_id, kind, amount_credits, balance_after, shadow,
             idempotency_key, reference_type, reference_id, metadata)
          VALUES (
            ${tenantId}, ${args.userId}, 'reservation', ${-required}, ${balanceBefore}, true,
            ${`reserve:${shadowId}`}, 'reservation', ${shadowId},
            ${JSON.stringify({ idempotencyKey: args.idempotencyKey, shadow: true })}::jsonb
          )
          ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        `,
      );
      return {
        ok: true,
        reservationId: shadowId,
        balanceAfter: balanceBefore,
        required,
        idempotent: false,
      };
    }

    if (balanceBefore < required) {
      return {
        ok: false,
        reservationId: null,
        balanceAfter: balanceBefore,
        required,
        idempotent: false,
      };
    }

    const balanceAfter = balanceBefore - required;
    await tx.execute(
      sql`
        UPDATE credit_wallets
        SET available_credits = ${balanceAfter}, updated_at = now()
        WHERE user_id = ${args.userId} AND tenant_id = ${tenantId}
      `,
    );
    const reservationRows = rowsOf<{ id: string }>(
      await tx.execute(
        sql`
          INSERT INTO credit_reservations
            (tenant_id, user_id, thread_id, trace_id, run_id, job_id,
             reserved_credits, status, idempotency_key)
          VALUES (
            ${tenantId}, ${args.userId},
            ${args.threadId ?? null}, ${args.traceId ?? null}, ${args.runId ?? null}, ${args.jobId ?? null},
            ${required}, 'reserved', ${args.idempotencyKey}
          )
          RETURNING id
        `,
      ),
    );
    const reservationId = reservationRows[0]?.id;
    if (!reservationId) throw new Error('Credit reservation insert returned no id');

    await tx.execute(
      sql`
        INSERT INTO credit_ledger
          (tenant_id, user_id, kind, amount_credits, balance_after,
           idempotency_key, reference_type, reference_id, metadata)
        VALUES (
          ${tenantId}, ${args.userId}, 'reservation', ${-required}, ${balanceAfter},
          ${`reserve:${reservationId}`}, 'reservation', ${reservationId},
          ${JSON.stringify({ idempotencyKey: args.idempotencyKey })}::jsonb
        )
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      `,
    );

    return {
      ok: true,
      reservationId,
      balanceAfter,
      required,
      idempotent: false,
    };
  };

  if (args.db) return run(args.db);
  // Inside a request/worker tenant transaction the scoped client is already
  // a transaction; starting a nested one is not portable across drivers.
  if (hasTenantDbScope()) return run(getDb());
  return getDb().transaction((tx) => run(tx));
}

/**
 * Settle a reservation against the actual post-stream cost.
 *
 * delta > 0 charges the remainder only while funds exist; the shortfall is
 * recorded on the reservation rather than driving the wallet negative.
 * delta < 0 refunds the unused estimate.
 */
export async function reconcileCreditReservation(args: {
  reservationId: string;
  actualCredits: number;
  db?: CreditDb;
  tenantId?: string;
}): Promise<ReconcileResult> {
  const actual = Math.max(0, Math.ceil(args.actualCredits));
  const run = async (tx: CreditDb): Promise<ReconcileResult> => {
    const reservationRows = rowsOf<{
      user_id: string;
      tenant_id: string;
      reserved_credits: number | string;
      status: string;
      shadow: boolean;
    }>(
      await tx.execute(
        sql`
          SELECT user_id, tenant_id, reserved_credits, status, shadow
          FROM credit_reservations
          WHERE id = ${args.reservationId}
          FOR UPDATE
        `,
      ),
    );
    const reservation = reservationRows[0];
    if (!reservation || reservation.status !== 'reserved') {
      return { reconciled: false, actualCredits: 0, balanceAfter: 0, shortfallCredits: 0 };
    }

    const tenantId = reservation.tenant_id;
    const reserved = asNumber(reservation.reserved_credits);
    const delta = actual - reserved;

    const walletRows = rowsOf<{ available_credits: number | string }>(
      await tx.execute(
        sql`
          SELECT available_credits FROM credit_wallets
          WHERE user_id = ${reservation.user_id} AND tenant_id = ${tenantId}
          FOR UPDATE
        `,
      ),
    );
    const balance = asNumber(walletRows[0]?.available_credits);

    const isShadow = Boolean(reservation.shadow);
    let charged = actual;
    let shortfall = 0;
    let newBalance = balance;
    if (isShadow) {
      // Shadow rows never move money; only the reservation/ledger analytics
      // record the simulated burn.
      charged = actual;
    } else if (delta > 0) {
      const extra = Math.min(balance, delta);
      shortfall = delta - extra;
      newBalance = balance - extra;
      charged = reserved + extra;
    } else if (delta < 0) {
      newBalance = balance + -delta;
    }

    if (!isShadow) {
      await tx.execute(
        sql`
          UPDATE credit_wallets
          SET available_credits = ${newBalance},
              lifetime_consumed = lifetime_consumed + ${charged},
              updated_at = now()
          WHERE user_id = ${reservation.user_id} AND tenant_id = ${tenantId}
        `,
      );
    }

    if (delta !== 0) {
      const movement = -(charged - reserved); // +refund, −extra charge
      await tx.execute(
        sql`
          INSERT INTO credit_ledger
            (tenant_id, user_id, kind, amount_credits, balance_after, shadow,
             idempotency_key, reference_type, reference_id, metadata)
          VALUES (
            ${tenantId}, ${reservation.user_id}, 'reconcile', ${movement}, ${newBalance}, ${isShadow},
            ${`reconcile:${args.reservationId}`}, 'reservation', ${args.reservationId},
            ${JSON.stringify({ reserved, actual: charged, shortfall, shadow: isShadow })}::jsonb
          )
          ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        `,
      );
    }

    await tx.execute(
      sql`
        UPDATE credit_reservations
        SET status = 'reconciled',
            actual_credits = ${charged},
            resolved_at = now(),
            last_error = ${shortfall > 0 ? `shortfall:${shortfall}` : null}
        WHERE id = ${args.reservationId} AND status = 'reserved'
      `,
    );

    return { reconciled: true, actualCredits: charged, balanceAfter: newBalance, shortfallCredits: shortfall };
  };

  if (args.db) return run(args.db);
  // Inside a request/worker tenant transaction the scoped client is already
  // a transaction; starting a nested one is not portable across drivers.
  if (hasTenantDbScope()) return run(getDb());
  return getDb().transaction((tx) => run(tx));
}

/** Release a reservation exactly once (error, cancellation, rejected turn). */
export async function releaseCreditReservation(args: {
  reservationId: string;
  db?: CreditDb;
}): Promise<boolean> {
  const run = async (tx: CreditDb): Promise<boolean> => {
    const reservationRows = rowsOf<{
      user_id: string;
      tenant_id: string;
      reserved_credits: number | string;
      status: string;
      shadow: boolean;
    }>(
      await tx.execute(
        sql`
          SELECT user_id, tenant_id, reserved_credits, status, shadow
          FROM credit_reservations
          WHERE id = ${args.reservationId}
          FOR UPDATE
        `,
      ),
    );
    const reservation = reservationRows[0];
    if (!reservation || reservation.status !== 'reserved') return false;
    const reserved = asNumber(reservation.reserved_credits);

    let balanceAfter: number;
    if (reservation.shadow) {
      const walletRows = rowsOf<{ available_credits: number | string }>(
        await tx.execute(
          sql`
            SELECT available_credits FROM credit_wallets
            WHERE user_id = ${reservation.user_id} AND tenant_id = ${reservation.tenant_id}
            FOR UPDATE
          `,
        ),
      );
      balanceAfter = asNumber(walletRows[0]?.available_credits);
    } else {
      const walletRows = rowsOf<{ available_credits: number | string }>(
        await tx.execute(
          sql`
            UPDATE credit_wallets
            SET available_credits = available_credits + ${reserved}, updated_at = now()
            WHERE user_id = ${reservation.user_id} AND tenant_id = ${reservation.tenant_id}
            RETURNING available_credits
          `,
        ),
      );
      balanceAfter = asNumber(walletRows[0]?.available_credits);
    }

    await tx.execute(
      sql`
        INSERT INTO credit_ledger
          (tenant_id, user_id, kind, amount_credits, balance_after, shadow,
           idempotency_key, reference_type, reference_id, metadata)
        VALUES (
          ${reservation.tenant_id}, ${reservation.user_id}, 'release', ${reserved}, ${balanceAfter}, ${reservation.shadow},
          ${`release:${args.reservationId}`}, 'reservation', ${args.reservationId},
          ${JSON.stringify({ reserved, shadow: reservation.shadow })}::jsonb
        )
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      `,
    );

    await tx.execute(
      sql`
        UPDATE credit_reservations
        SET status = 'released', actual_credits = 0, resolved_at = now()
        WHERE id = ${args.reservationId} AND status = 'reserved'
      `,
    );
    return true;
  };

  if (args.db) return run(args.db);
  // Inside a request/worker tenant transaction the scoped client is already
  // a transaction; starting a nested one is not portable across drivers.
  if (hasTenantDbScope()) return run(getDb());
  return getDb().transaction((tx) => run(tx));
}

/**
 * D4 — expire the unused portion of the previous subscription grant.
 *
 * Credits are fungible, so v1 attributes consumption FIFO (subscription
 * first): the previous grant minus net consumption since it was issued is
 * expired. Top-up grants are never touched. Runs only when a new period is
 * first observed, so the steady-state turn path adds no work.
 */
export async function expireUnusedSubscriptionGrant(input: {
  userId: string;
  tenantId: string;
  subscriptionId: string;
  newPeriodStart: Date;
  db?: Db;
}): Promise<number> {
  const db = input.db ?? getDb();
  const [previous] = await db
    .select({
      id: schema.creditLedger.id,
      amount: schema.creditLedger.amountCredits,
      createdAt: schema.creditLedger.createdAt,
      idempotencyKey: schema.creditLedger.idempotencyKey,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.tenantId, input.tenantId),
        eq(schema.creditLedger.userId, input.userId),
        eq(schema.creditLedger.kind, 'subscription_grant'),
        eq(schema.creditLedger.shadow, false),
        like(schema.creditLedger.idempotencyKey, `sub:${input.subscriptionId}:%`),
        ne(
          schema.creditLedger.idempotencyKey,
          `sub:${input.subscriptionId}:${input.newPeriodStart.toISOString().slice(0, 10)}`,
        ),
      ),
    )
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(1);
  if (!previous) return 0;

  const rows = rowsOf<{ consumed: number | string }>(
    await db.execute(
      sql`
        SELECT coalesce(sum(-amount_credits), 0) AS consumed
        FROM credit_ledger
        WHERE tenant_id = ${input.tenantId}
          AND user_id = ${input.userId}
          AND shadow = false
          AND kind IN ('reservation','reconcile','release','consumption')
          AND created_at >= ${previous.createdAt.toISOString()}
          AND created_at < ${input.newPeriodStart.toISOString()}
      `,
    ),
  );
  const consumed = Math.max(0, asNumber(rows[0]?.consumed));
  const unused = Math.max(0, asNumber(previous.amount) - consumed);
  if (unused <= 0) return 0;

  const result = await expireCredits({
    userId: input.userId,
    tenantId: input.tenantId,
    amountCredits: unused,
    idempotencyKey: `expire:${previous.id}`,
    referenceId: previous.idempotencyKey,
    metadata: { subscriptionId: input.subscriptionId, unused },
    ...(input.db ? { db: input.db } : {}),
  });
  return result.applied ? unused : 0;
}

/**
 * Lazily grant the current cycle's plan credits exactly once.
 *
 * Active subscriptions use their Stripe/period anchor; free users use the
 * UTC calendar month. Called by the wallet read + reservation paths, so a
 * user never needs to visit billing before their first turn.
 */
export async function ensureMonthlyGrant(
  userId: string,
  opts: { db?: Db; tenantId?: string; now?: Date } = {},
): Promise<CreditMutationResult | null> {
  const db = opts.db ?? getDb();
  const tenantId = await resolveTenant(userId, db, opts.tenantId);
  const now = opts.now ?? new Date();

  const [sub] = await db
    .select({
      id: schema.subscriptions.id,
      status: schema.subscriptions.status,
      currentPeriodStart: schema.subscriptions.currentPeriodStart,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      planName: schema.plans.name,
      monthlyCredits: schema.plans.monthlyCredits,
      priceUsdCents: schema.plans.priceUsdCents,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
    .where(eq(schema.subscriptions.tenantId, tenantId))
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);

  const hasLedgerKey = async (key: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: schema.creditLedger.id })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.tenantId, tenantId),
          eq(schema.creditLedger.idempotencyKey, key),
        ),
      )
      .limit(1);
    return Boolean(row);
  };

  const subStillEntitled = Boolean(
    sub &&
      (sub.status === 'active' ||
        sub.status === 'trialing' ||
        sub.status === 'past_due' ||
        (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime())),
  );
  if (sub && subStillEntitled) {
    // Enterprise / unlimited plans have monthlyCredits = 0 by design. They
    // must not fall through to the Free grant.
    if (asNumber(sub.monthlyCredits) <= 0) return null;
    const periodStart = sub.currentPeriodStart ?? startOfUtcMonth(now);
    // Day granularity absorbs provider timestamp jitter between
    // `invoice.period_start` and the subscription item's period fields.
    const periodKey = periodStart.toISOString().slice(0, 10);
    const idempotencyKey = `sub:${sub.id}:${periodKey}`;
    // Cheap read avoids taking the wallet lock on every chat turn once the
    // cycle grant already exists. The unique ledger index still serialises a
    // genuine first-turn race.
    if (await hasLedgerKey(idempotencyKey)) return null;
    await expireUnusedSubscriptionGrant({
      userId,
      tenantId,
      subscriptionId: sub.id,
      newPeriodStart: periodStart,
      db,
    });
    return grantCredits({
      userId,
      amountCredits: asNumber(sub.monthlyCredits),
      kind: 'subscription_grant',
      idempotencyKey,
      referenceType: 'subscription',
      referenceId: sub.id,
      metadata: { plan: sub.planName, periodStart: periodStart.toISOString() },
    });
  }

  const [freePlan] = await db
    .select({ id: schema.plans.id, name: schema.plans.name, monthlyCredits: schema.plans.monthlyCredits })
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.name, 'Free'),
        eq(schema.plans.isActive, true),
      ),
    )
    .limit(1);
  if (!freePlan || asNumber(freePlan.monthlyCredits) <= 0) return null;

  const freeKey = `free:${userId}:${utcMonthKey(now)}`;
  if (await hasLedgerKey(freeKey)) return null;
  return grantCredits({
    userId,
    amountCredits: asNumber(freePlan.monthlyCredits),
    kind: 'promo_grant',
    idempotencyKey: freeKey,
    referenceType: 'manual',
    metadata: { plan: 'Free', month: utcMonthKey(now) },
  });
}

/** Read the wallet after ensuring the current cycle grant has been applied. */
export async function getWalletWithGrant(
  userId: string,
  opts: { db?: Db; tenantId?: string; now?: Date } = {},
): Promise<CreditWallet> {
  const db = opts.db ?? getDb();
  await ensureMonthlyGrant(userId, { db, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}), ...(opts.now ? { now: opts.now } : {}) });
  return ensureWallet(userId, { db, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) });
}

/**
 * Recover reservations left `reserved` by a crashed process. Mirrors the
 * durable Full-job guard used by `recoverStaleBudgetReservations`: a live
 * queue lease keeps its reservation until the worker settles it.
 */
export async function reclaimStaleCreditReservations(
  cutoff: Date,
  limit = 100,
  signal?: AbortSignal,
): Promise<{ scanned: number; released: number; failed: number }> {
  if (signal?.aborted) return { scanned: 0, released: 0, failed: 0 };
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  // Cross-tenant sweep: the BYPASSRLS connection is required when shared mode
  // is configured, otherwise the RLS policy hides every row.
  const sweepDb = process.env.ADMIN_DATABASE_URL ? getAdminDb() : getDb();
  const rows = rowsOf<{ id: string; tenant_id: string }>(
    await sweepDb.execute(
      sql`
        SELECT r.id, r.tenant_id
        FROM credit_reservations r
        WHERE r.status = 'reserved' AND r.created_at < ${cutoff.toISOString()}
          AND NOT EXISTS (
            SELECT 1 FROM full_analysis_queue q
            WHERE q.run_id = r.run_id
              AND (q.status = 'pending' OR (q.status = 'running' AND q.lease_expires_at > now()))
          )
        ORDER BY r.created_at ASC
        LIMIT ${boundedLimit}
      `,
    ),
  );

  let released = 0;
  let failed = 0;
  for (const row of rows) {
    if (signal?.aborted) break;
    try {
      if (await releaseCreditReservation({ reservationId: row.id, db: sweepDb })) released += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: rows.length, released, failed };
}

/** List reserved rows for diagnostics/admin views. */
export async function listStaleCreditReservations(cutoff: Date, limit = 100) {
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const sweepDb = process.env.ADMIN_DATABASE_URL ? getAdminDb() : getDb();
  return sweepDb
    .select()
    .from(schema.creditReservations)
    .where(and(eq(schema.creditReservations.status, 'reserved'), lt(schema.creditReservations.createdAt, cutoff)))
    .orderBy(asc(schema.creditReservations.createdAt))
    .limit(boundedLimit);
}
