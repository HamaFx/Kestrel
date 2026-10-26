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

import { getDb, requireTenantIdForUser, schema } from '@kestrel/db';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { OnboardingWizard } from '@/components/onboarding/wizard';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const db = getDb();
  const tenantId = await requireTenantIdForUser(session.user.id, db);
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(
      and(
        eq(schema.userSettings.userId, session.user.id),
        eq(schema.userSettings.tenantId, tenantId),
      ),
    );

  if (settings?.onboardingCompleted) {
    redirect('/dashboard');
  }

  const symbolsCatalog = await db
    .select()
    .from(schema.symbolCatalog)
    .where(
      and(eq(schema.symbolCatalog.isActive, true), eq(schema.symbolCatalog.tenantId, '__system__')),
    )
    .orderBy(schema.symbolCatalog.sortOrder);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center text-center">
        <KestrelBrand variant="lockup" decorative priority className="mb-5 w-44 sm:w-52" />
        <p className="text-brand text-caption mb-2 font-semibold tracking-[0.18em] uppercase">
          Quick Account Setup
        </p>
        <h1 className="text-fg font-display mb-2 text-2xl font-normal tracking-[-0.03em] sm:text-3xl">
          Welcome to Kestrel
        </h1>
        <p className="text-fg-muted max-w-md leading-relaxed">
          Customize your profile, trading style, and watchlist so your 4-desk AI committee is
          tailored to how you trade.
        </p>
      </div>
      <OnboardingWizard
        initialName={session.user.name || ''}
        symbolsCatalog={symbolsCatalog}
        initialProgress={settings?.onboardingProgress ?? null}
      />
    </div>
  );
}
