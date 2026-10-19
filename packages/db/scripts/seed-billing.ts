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

/* eslint-disable no-console -- seed progress is the CLI interface. */

// Seed the credit-era plan catalogue + top-up packs (idempotent).
//
// Run: pnpm --filter @kestrel/db seed:billing
//
// 1 credit = $0.001. Prices/credits are launch baselines; operators can edit
// plans in the admin UI afterwards.

import { eq } from 'drizzle-orm';

import { getDb } from '../src/client';
import { creditTopupProducts, plans } from '../src/schema';

const FEATURES = {
  free: ['chat_basic', 'chart_basic', 'journal_basic'],
  starter: [
    'chat_basic',
    'chat_single',
    'chart_basic',
    'chart_advanced',
    'journal_basic',
    'journal_unlimited',
    'alerts_5',
    'api_read',
  ],
  pro: [
    'chat_basic',
    'chat_single',
    'chat_full',
    'chart_basic',
    'chart_advanced',
    'journal_basic',
    'journal_unlimited',
    'alerts_20',
    'web_search',
    'telegram_bot',
    'api_read',
  ],
  scale: [
    'chat_basic',
    'chat_single',
    'chat_full',
    'chat_full_unlimited',
    'chart_basic',
    'chart_advanced',
    'journal_basic',
    'journal_unlimited',
    'alerts_100',
    'web_search',
    'telegram_bot',
    'backtesting',
    'priority',
    'api_read',
  ],
  enterprise: [
    'chat_basic',
    'chat_single',
    'chat_full',
    'chat_full_unlimited',
    'chart_basic',
    'chart_advanced',
    'journal_basic',
    'journal_unlimited',
    'alerts_unlimited',
    'web_search',
    'telegram_bot',
    'backtesting',
    'priority',
    'api_access',
    'sso',
    'sla',
  ],
} as const;

export const SEED_PLANS = [
  {
    name: 'Free',
    priceUsdCents: 0,
    interval: 'monthly' as const,
    monthlyCredits: 1_000,
    monthlyTokenCap: 100_000,
    features: [...FEATURES.free],
    sortOrder: 0,
  },
  {
    name: 'Starter',
    priceUsdCents: 900,
    interval: 'monthly' as const,
    monthlyCredits: 8_000,
    monthlyTokenCap: 1_336_000,
    features: [...FEATURES.starter],
    sortOrder: 10,
  },
  {
    name: 'Pro',
    priceUsdCents: 2_900,
    interval: 'monthly' as const,
    monthlyCredits: 30_000,
    monthlyTokenCap: 5_000_000,
    features: [...FEATURES.pro],
    sortOrder: 20,
  },
  {
    name: 'Scale',
    priceUsdCents: 7_900,
    interval: 'monthly' as const,
    monthlyCredits: 100_000,
    monthlyTokenCap: 16_670_000,
    features: [...FEATURES.scale],
    sortOrder: 30,
  },
  {
    name: 'Enterprise',
    priceUsdCents: 0,
    interval: 'yearly' as const,
    monthlyCredits: 0,
    monthlyTokenCap: null,
    features: [...FEATURES.enterprise],
    sortOrder: 40,
  },
];

export const SEED_TOPUPS = [
  { name: '5,000 Credits', credits: 5_000, priceUsdCents: 499, sortOrder: 10 },
  { name: '15,000 Credits', credits: 15_000, priceUsdCents: 1_299, sortOrder: 20 },
  { name: '50,000 Credits', credits: 50_000, priceUsdCents: 3_999, sortOrder: 30 },
];

async function seedBilling() {
  const db = getDb();

  for (const plan of SEED_PLANS) {
    const [existing] = await db.select().from(plans).where(eq(plans.name, plan.name)).limit(1);
    if (existing) {
      await db
        .update(plans)
        .set({ ...plan, isActive: true, visible: true, updatedAt: new Date() })
        .where(eq(plans.id, existing.id));
      console.log(`[seed] Updated plan: ${plan.name}`);
    } else {
      await db.insert(plans).values({ ...plan, isActive: true, visible: true });
      console.log(`[seed] Created plan: ${plan.name}`);
    }
  }

  for (const product of SEED_TOPUPS) {
    const [existing] = await db
      .select()
      .from(creditTopupProducts)
      .where(eq(creditTopupProducts.name, product.name))
      .limit(1);
    if (existing) {
      await db
        .update(creditTopupProducts)
        .set({ ...product, isActive: true })
        .where(eq(creditTopupProducts.id, existing.id));
      console.log(`[seed] Updated top-up: ${product.name}`);
    } else {
      await db.insert(creditTopupProducts).values({ ...product, isActive: true });
      console.log(`[seed] Created top-up: ${product.name}`);
    }
  }

  console.log('[seed] Billing catalogue ready.');
}

seedBilling().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
