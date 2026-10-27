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
import { IconCheck } from '@tabler/icons-react';
import { useMemo } from 'react';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

import { SPECIALIST_DESKS } from './types';
import type { PlatformConfigController } from './use-platform-config';

export function RoutingSection({ controller }: { controller: PlatformConfigController }) {
  const { data, form, ui, setForm, saveRouting, toggleFallbackProvider } = controller;
  const { allChatModels, allEmbeddingModels } = useMemo(() => {
    const providers = data?.providers ?? [];
    return {
      allChatModels: providers.flatMap((p) =>
        p.models
          .filter((m) => m.tier !== 'embedding')
          .map((m) => ({
            qualifiedId: `${p.id}:${m.modelId}`,
            providerName: p.displayName,
            hasKey: p.hasKey,
            label: m.label ?? m.modelId,
            tier: m.tier ?? 'standard',
          })),
      ),
      allEmbeddingModels: providers.flatMap((p) =>
        p.models
          .filter((m) => m.tier === 'embedding')
          .map((m) => ({
            qualifiedId: `${p.id}:${m.modelId}`,
            providerName: p.displayName,
            label: m.label ?? m.modelId,
          })),
      ),
    };
  }, [data]);
  if (!data) return null;

  return (
    <SettingsSection
      title="2. Global Model Routing & 4-Analyst Committee Configuration"
      description="Choose the default models, provider fallback order, and per-desk specialist models used for all subscriber conversations."
    >
      <div className="border-border bg-bg-elev-1 flex flex-col gap-5 rounded-lg border p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-fg text-xs font-semibold">Default Subscriber Chat Model</span>
            <select
              value={form.chatModel}
              onChange={(e) => setForm({ chatModel: e.target.value })}
              className="border-border bg-bg-elev-2 text-fg rounded-sm border px-3 py-2 text-xs"
            >
              <option value="">Automatic (Highest-priority active provider)</option>
              {allChatModels.map((m) => (
                <option key={m.qualifiedId} value={m.qualifiedId}>
                  {m.providerName} — {m.label} ({m.tier}){!m.hasKey ? ' [No Key]' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-fg text-xs font-semibold">Vision / Chart Screenshot Model</span>
            <select
              value={form.visionModel}
              onChange={(e) => setForm({ visionModel: e.target.value })}
              className="border-border bg-bg-elev-2 text-fg rounded-sm border px-3 py-2 text-xs"
            >
              <option value="">Automatic Vision Default</option>
              {allChatModels.map((m) => (
                <option key={m.qualifiedId} value={m.qualifiedId}>
                  {m.providerName} — {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-fg text-xs font-semibold">Memory & RAG Embedding Model</span>
            <select
              value={form.embeddingModel}
              onChange={(e) => setForm({ embeddingModel: e.target.value })}
              className="border-border bg-bg-elev-2 text-fg rounded-sm border px-3 py-2 text-xs"
            >
              <option value="">Automatic Embedding Default</option>
              {allEmbeddingModels.map((m) => (
                <option key={m.qualifiedId} value={m.qualifiedId}>
                  {m.providerName} — {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="border-border flex flex-col gap-2 border-t pt-4">
          <span className="text-fg text-xs font-semibold">
            Provider Fallback Chain (click to add/remove in failover order)
          </span>
          <div className="flex flex-wrap gap-2">
            {data.providers.map((p) => {
              const idx = form.fallbackChain.indexOf(p.id);
              const selected = idx !== -1;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleFallbackProvider(p.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-brand bg-brand/15 text-fg'
                      : 'border-border bg-bg-elev-2 text-fg-subtle hover:text-fg'
                  }`}
                >
                  {selected ? `${idx + 1}. ` : ''}
                  {p.displayName}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-border flex flex-col gap-4 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-fg text-xs font-semibold">
                Default Subscriber Analysis Mode
              </span>
              <p className="text-caption text-fg-subtle">
                Initial mode selected when a subscriber opens Chat.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(['single', 'full'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setForm({ defaultMode: mode })}
                  className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${
                    form.defaultMode === mode
                      ? 'border-brand bg-brand/15 text-fg'
                      : 'border-border bg-bg-elev-2 text-fg-subtle'
                  }`}
                >
                  {mode === 'single' ? 'Fast Scout (Single Desk)' : 'Convene Council (4 Desks)'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-fg text-xs font-semibold">
                Show Individual Analyst Desk Breakdowns
              </span>
              <p className="text-caption text-fg-subtle">
                Display Technical, Macro, Sentiment, and Risk cards inside Convene Council reports.
              </p>
            </div>
            <Switch
              checked={form.showOpinions}
              onCheckedChange={(checked) => setForm({ showOpinions: checked })}
              srLabel="Show individual analyst desk breakdowns"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SPECIALIST_DESKS.map((desk) => (
              <div
                key={desk.key}
                className="border-border bg-bg-elev-2/50 flex flex-col gap-1.5 rounded-sm border p-3"
              >
                <span className="text-fg text-xs font-semibold">{desk.label}</span>
                <span className="text-caption text-fg-subtle">{desk.description}</span>
                <select
                  value={form.deskOverrides[desk.key] ?? ''}
                  onChange={(e) => {
                    const next = { ...form.deskOverrides };
                    if (!e.target.value) delete next[desk.key];
                    else next[desk.key] = e.target.value;
                    setForm({ deskOverrides: next });
                  }}
                  className="border-border bg-bg-elev-1 text-fg mt-1 rounded-sm border px-2.5 py-1.5 text-xs"
                >
                  <option value="">Recommended Tier Default</option>
                  {allChatModels.map((m) => (
                    <option key={m.qualifiedId} value={m.qualifiedId}>
                      {m.providerName} — {m.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-fg text-xs font-semibold">
              Global Platform Instructions (Optional)
            </span>
            <textarea
              rows={2}
              value={form.customInstructions}
              onChange={(e) => setForm({ customInstructions: e.target.value })}
              placeholder="Optional house style or risk framing instructions applied across subscriber chat turns..."
              className="border-border bg-bg-elev-2 text-fg rounded-sm border p-2.5 text-xs"
            />
          </label>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={ui.savingRouting}
              onClick={saveRouting}
            >
              <IconCheck className="mr-1.5 size-3.5" />
              Save Global Routing & Committee Config
            </Button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
