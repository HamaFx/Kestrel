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

import { getUserWithSettings, listUserSymbols } from '@kestrel/db';
import { DEFAULT_WATCHLIST_SYMBOLS } from '@kestrel/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { DataCard } from '../_components/data/data-card';
import { PreferencesCard } from '../_components/data/preferences-card';

export const metadata: Metadata = {
  title: 'Data · Settings',
  description: 'Export trade history, clear AI threads, or manage data retention.',
};
export const revalidate = 60;

export default async function DataPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const [{ settings }, symbolRows] = await Promise.all([
    getUserWithSettings(userId),
    listUserSymbols(userId),
  ]);

  const list = symbolRows;

  const watchlist: string[] =
    list.length > 0 ? list.map((item) => item.symbol) : [...DEFAULT_WATCHLIST_SYMBOLS];

  const uiPrefs = {
    defaultSymbol: settings?.defaultSymbol ?? null,
    timeFormat: settings?.timeFormat ?? null,
    reduceMotion: settings?.reduceMotion ?? null,
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Data & Preferences</h2>
        <p className="text-fg-subtle text-sm">
          Local data management, cache controls, and display preferences.
        </p>
      </div>

      <DataCard />
      <PreferencesCard watchlist={watchlist} initialPrefs={uiPrefs} />
    </div>
  );
}
