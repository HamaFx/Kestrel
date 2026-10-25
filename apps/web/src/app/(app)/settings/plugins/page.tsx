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

// /settings/plugins — the 1-click Plugin Store.
//
// Installed plugins are resolved on the server (tenant-scoped) and passed to
// the client grid as serialisable view models. All mutations go through
// /api/plugins/manage.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { buildPluginStoreSnapshot } from '@/lib/services/plugin-manage';

import { PluginStoreGrid } from './_components/plugin-store-grid';

export const metadata: Metadata = {
  title: 'Plugins · Settings',
  description:
    'Install, configure, and manage the capabilities available to your Kestrel workspace.',
};

export const dynamic = 'force-dynamic';

export default async function PluginStorePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const snapshot = await buildPluginStoreSnapshot(session.user.id);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Plugins</h2>
        <p className="text-fg-subtle text-sm">
          Install only the capabilities you need. Installing is free and instant; uninstalling
          removes the plugin&apos;s tools, sidebar tabs, widgets, and scheduled jobs for your
          account.
        </p>
      </div>

      <PluginStoreGrid initialSnapshot={snapshot} />
    </div>
  );
}
