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

// /plugins/<pluginId>/<...slug> — dynamic plugin page shell.
//
// Installed plugins can register pages in their `definePluginUi()` definition.
// The core owns auth + install gating; the plugin owns the page body.

import { getInstalledPlugin, requireTenantIdForUser, withTenantDb } from '@kestrel/db';
import { pluginHost } from '@kestrel/plugin-sdk';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';

import { PluginPageHost } from './_components/plugin-page-host';

export const dynamic = 'force-dynamic';

interface PluginPageRouteProps {
  params: Promise<{ pluginId: string; slug?: string[] }>;
}

export async function generateMetadata({ params }: PluginPageRouteProps): Promise<Metadata> {
  const { pluginId } = await params;
  const manifest = pluginHost.getPlugin(pluginId)?.manifest;
  return {
    title: manifest ? `${manifest.name} · Plugins` : 'Plugin',
    description: manifest?.tagline ?? 'Kestrel plugin page',
  };
}

export default async function PluginPage({ params }: PluginPageRouteProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { pluginId, slug } = await params;
  const registered = pluginHost.getPlugin(pluginId);
  if (!registered) notFound();

  let installed = false;
  try {
    const tenantId = await requireTenantIdForUser(session.user.id);
    const row = await withTenantDb(tenantId, () => getInstalledPlugin(session.user.id, pluginId), {
      userId: session.user.id,
    });
    installed = row !== undefined && row.enabled;
  } catch {
    // Fail closed on the page: the Store still shows the plugin as available.
  }
  if (!installed) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-fg font-display text-2xl font-normal tracking-[-0.03em]">
          {registered.manifest.name}
        </h1>
        <p className="text-fg-subtle text-sm">{registered.manifest.tagline}</p>
      </header>

      <PluginPageHost pluginId={pluginId} slug={slug ?? []} />
    </div>
  );
}
