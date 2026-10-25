// SPDX-License-Identifier: Apache-2.0

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
import { IconKey, IconTrash } from '@tabler/icons-react';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelative } from '@/lib/formatters/format';

import type { PlatformConfigController } from './use-platform-config';

export function ProviderKeysSection({ controller }: { controller: PlatformConfigController }) {
  const { data, ui, dispatch, saveProviderKey, clearProviderKey, testProvider } = controller;
  if (!data) return null;
  return (
    <SettingsSection
      title="1. Platform AI Provider Keys & Connection Health"
      description="Add, rotate, or test encrypted provider API keys stored in the database (or supplied via server environment variables)."
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data.providers.map((p) => {
          const isBusy = ui.busyProvider === p.id;
          const draftVal = ui.keyDrafts[p.id] ?? '';
          return (
            <div
              key={p.id}
              className="border-border bg-bg-elev-1 flex flex-col justify-between gap-3 rounded-lg border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <IconKey className="text-fg-muted size-4" />
                    <span className="text-fg text-sm font-semibold">{p.displayName}</span>
                    <Badge tone={p.hasKey ? 'success' : 'neutral'}>
                      {p.hasDbKey ? 'DB Key Active' : p.hasKey ? 'Env Key Active' : 'Not Set'}
                    </Badge>
                    {p.health && (
                      <Badge tone={p.health.ok ? 'success' : 'danger'}>
                        {p.health.ok ? 'Healthy' : 'Error'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-caption text-fg-subtle mt-1">
                    30d usage: {p.usage30d.turns} turns · ${p.usage30d.costUsd.toFixed(4)}
                    {p.health?.testedAt ? ` · Checked ${formatRelative(p.health.testedAt)}` : ''}
                  </p>
                  {p.health && !p.health.ok && p.health.error && (
                    <p className="text-caption text-danger mt-1">{p.health.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {p.hasKey && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={isBusy}
                      onClick={() => testProvider(p.id)}
                    >
                      Test
                    </Button>
                  )}
                  {p.hasDbKey && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={isBusy}
                      onClick={() => clearProviderKey(p.id)}
                      title="Clear stored database key"
                    >
                      <IconTrash className="text-danger size-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder={
                    p.hasKey
                      ? `Rotate ${p.displayName} API key...`
                      : `Paste ${p.displayName} API key...`
                  }
                  value={draftVal}
                  onChange={(e) =>
                    dispatch({ type: 'keyDraft', providerId: p.id, value: e.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={isBusy}
                  disabled={!draftVal.trim()}
                  onClick={() => saveProviderKey(p.id)}
                >
                  Save
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
