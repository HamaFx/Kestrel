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

import { getUserWithSettings } from '@kestrel/db';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { AppearanceCard } from '../_components/appearance/appearance-card';

export const metadata: Metadata = {
  title: 'Appearance · Settings',
  description: 'Customize UI theme, visual density, and chart appearance.',
};
export const revalidate = 60;

export default async function AppearancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const { settings } = await getUserWithSettings(userId);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Appearance</h2>
        <p className="text-fg-subtle text-sm">Theme, locale, and display preferences.</p>
      </div>

      <AppearanceCard initialLocale={settings?.language ?? 'en'} />
    </div>
  );
}
