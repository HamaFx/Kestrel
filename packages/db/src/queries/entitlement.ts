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

// Entitlement + credit gate facade.
//
// Entitlement answers "is this feature included in the plan?"; credits answer
// "is there budget for this turn?". Chat calls both: entitlement first, then
// credits (plan §4 invariant 10). BYOK turns always pass the credit gate but
// still record telemetry.

import { readFeatureFlag } from '@kestrel/shared';
import { and, asc, desc, eq } from 'drizzle-orm';

import { getDb, schema } from '../client';
import { requireTenantIdForUser } from '../tenant';
import { getWalletWithGrant, type CreditWallet } from './credit-wallet';

export interface EntitlementSnapshot {
  userId: string;
  tenantId: string;
  subscriptionId: string | null;
  status: string;
  planId: string | null;
  planName: string;
  features: string[];
  monthlyCredits: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  wallet: CreditWallet;
}

export interface EntitlementResult {
  ok: boolean;
  reason?: 'plan_required' | 'no_tenant';
  requiredPlan?: string;
  feature: string;
}

export interface CreditGateResult {
  ok: boolean;
  balance: number;
  required: number;
  enforced: boolean;
}

export const FREE_FEATURES = ['chat_basic', 'chart_basic', 'journal_basic'] as const;

/** True only when the operator has explicitly enabled 402 enforcement. */
export function isCreditsEnforcementEnabled(): boolean {
  return readFeatureFlag('CREDITS_ENFORCEMENT_ENABLED');
}

export function isCreditsShadowLogEnabled(): boolean {
  return readFeatureFlag('CREDITS_SHADOW_LOG');
}

/** One joined read for header chips, billing page, and route gates. */
export async function getEntitlementSnapshot(userId: string): Promise<EntitlementSnapshot> {
  const db = getDb();
  const tenantId = await requireTenantIdForUser(userId, db);

  const [sub] = await db
    .select({
      id: schema.subscriptions.id,
      status: schema.subscriptions.status,
      planId: schema.subscriptions.planId,
      currentPeriodStart: schema.subscriptions.currentPeriodStart,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
      planName: schema.plans.name,
      features: schema.plans.features,
      monthlyCredits: schema.plans.monthlyCredits,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
    .where(eq(schema.subscriptions.tenantId, tenantId))
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);

  const active = Boolean(sub && (sub.status === 'active' || sub.status === 'trialing'));
  let features: string[] = [...FREE_FEATURES];
  let planName = 'Free';
  let monthlyCredits = 0;
  let planId: string | null = null;
  if (active && sub) {
    features = Array.isArray(sub.features) ? sub.features : [];
    planName = sub.planName;
    planId = sub.planId;
    monthlyCredits = Number(sub.monthlyCredits ?? 0);
  } else {
    const [freePlan] = await db
      .select({ id: schema.plans.id, features: schema.plans.features, monthlyCredits: schema.plans.monthlyCredits })
      .from(schema.plans)
      .where(and(eq(schema.plans.name, 'Free'), eq(schema.plans.isActive, true)))
      .limit(1);
    if (freePlan) {
      planId = freePlan.id;
      features = Array.isArray(freePlan.features) ? freePlan.features : features;
      monthlyCredits = Number(freePlan.monthlyCredits ?? 0);
    }
  }

  const wallet = await getWalletWithGrant(userId, { tenantId });
  return {
    userId,
    tenantId,
    subscriptionId: active && sub ? sub.id : null,
    status: active && sub ? sub.status : 'expired',
    planId,
    planName,
    features,
    monthlyCredits,
    currentPeriodStart: active && sub ? sub.currentPeriodStart : null,
    currentPeriodEnd: active && sub ? sub.currentPeriodEnd : null,
    cancelAtPeriodEnd: active && sub ? sub.cancelAtPeriodEnd : false,
    wallet,
  };
}

/** Plan features are additive string sets; unknown features fail closed. */
export async function assertEntitlement(
  userId: string,
  feature: string,
): Promise<EntitlementResult> {
  const snapshot = await getEntitlementSnapshot(userId);
  if (snapshot.features.includes(feature)) return { ok: true, feature };

  const db = getDb();
  const plans = await db
    .select({ name: schema.plans.name, features: schema.plans.features })
    .from(schema.plans)
    .where(and(eq(schema.plans.isActive, true), eq(schema.plans.visible, true)))
    .orderBy(asc(schema.plans.sortOrder));
  const requiredPlan = plans.find(
    (plan) => Array.isArray(plan.features) && plan.features.includes(feature),
  )?.name;

  return {
    ok: false,
    reason: 'plan_required',
    ...(requiredPlan ? { requiredPlan } : {}),
    feature,
  };
}

/**
 * Credit admission. When enforcement is off this is a pure read used for
 * shadow telemetry; it never blocks.
 */
export async function assertCredits(userId: string, estimateCredits: number): Promise<CreditGateResult> {
  const required = Math.max(0, Math.ceil(estimateCredits));
  const snapshot = await getEntitlementSnapshot(userId);
  const wallet = snapshot.wallet;
  const enforced = isCreditsEnforcementEnabled();
  // BYOK / zero-cost turns and unlimited Enterprise plans are always admitted.
  if (required === 0 || snapshot.features.includes('ai_unlimited')) {
    return { ok: true, balance: wallet.availableCredits, required, enforced };
  }
  return {
    ok: !enforced || wallet.availableCredits >= required,
    balance: wallet.availableCredits,
    required,
    enforced,
  };
}
