'use client';

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

// Client host for plugin-registered pages.
//
// The server page performs auth, registration and install checks, then hands
// the path to this component. Plugin pages are looked up in the UI registry so
// a plugin can ship `/plugins/<id>/runs/:runId` without a core route per page.
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import { IconPuzzle } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import '@/lib/plugins/register-ui';

export function PluginPageHost({ pluginId, slug }: { pluginId: string; slug: readonly string[] }) {
  const path = slug.join('/');
  const resolved = pluginUiRegistry.resolvePage(pluginId, path);

  if (!resolved) {
    return (
      <div className="border-border/60 bg-bg-elev-1/40 flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <IconPuzzle className="text-fg-subtle size-6" />
        <p className="text-fg text-sm font-semibold">This plugin page is not available</p>
        <p className="text-fg-subtle max-w-sm text-xs">
          The plugin is installed, but it has not registered a page at this path. Manage its
          settings from the Plugin Store.
        </p>
        <Link
          href="/settings/plugins"
          className="text-brand mt-1 text-xs font-semibold hover:underline"
        >
          Open Plugin Store
        </Link>
      </div>
    );
  }

  const Component = resolved.page.component;
  return <Component pluginId={pluginId} params={{ ...resolved.params, slug: path }} />;
}
