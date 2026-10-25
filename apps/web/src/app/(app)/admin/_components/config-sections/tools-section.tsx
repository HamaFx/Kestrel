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
import { IconTool } from '@tabler/icons-react';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

import type { PlatformConfigController } from './use-platform-config';

export function ToolsSection({ controller }: { controller: PlatformConfigController }) {
  const { data, form, ui, toggleTool } = controller;
  if (!data) return null;
  return (
    <SettingsSection
      title="5. Global Agent Tool Switches & 24h Telemetry"
      description="Enable or disable individual research tools across all subscriber chat sessions and monitor real-time tool latency."
    >
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {data.tools.catalogue.map((tool) => {
          const isEnabled = !form.disabledTools.includes(tool.name);
          return (
            <div
              key={tool.name}
              className="border-border bg-bg-elev-1 flex items-start justify-between gap-3 rounded-lg border p-3.5"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <IconTool className="text-fg-muted size-3.5 shrink-0" />
                  <code className="text-fg font-mono text-xs font-semibold">{tool.name}</code>
                  <Badge tone={isEnabled ? 'success' : 'warn'}>
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <p className="text-caption text-fg-subtle leading-relaxed">{tool.description}</p>
                <div className="text-caption text-fg-muted mt-1 flex flex-wrap items-center gap-2 font-mono">
                  <span>24h: {tool.invocations24h} calls</span>
                  {tool.failures24h > 0 && (
                    <span className="text-danger">{tool.failures24h} errors</span>
                  )}
                  {tool.invocations24h > 0 && (
                    <span>
                      p50 {tool.medianMs}ms · p95 {tool.p95Ms}ms
                    </span>
                  )}
                </div>
              </div>
              <Switch
                checked={isEnabled}
                disabled={ui.savingTools}
                onCheckedChange={(checked) => toggleTool(tool.name, checked)}
                srLabel={`Toggle ${tool.name}`}
              />
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}
