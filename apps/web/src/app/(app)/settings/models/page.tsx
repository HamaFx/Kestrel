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
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { buildCatalogForUser } from '@/lib/catalog-server';

import { FallbackChainPicker } from './_components/fallback-chain-picker';
import {
  ChatModelPicker,
  EmbeddingModelPicker,
  VisionModelPicker,
} from './_components/model-picker';
import { AISubNav } from '../_components/ai-subnav';

export const revalidate = 60;

export const metadata = {
  title: 'Models | Kestrel',
  description: 'Pick the default chat, vision, and embedding models.',
};

/**
 * Phase D2 — single-page models settings.
 *
 * The chat picker is the only surface most users touch (top section,
 * always visible). Vision + embedding pickers live under an
 * <details> Advanced disclosure because:
 *   - Most users don't think about which model analyses chart
 *     screenshots or which model embeds their journal entries.
 *   - The defaults are usually fine (operator env + spec defaults).
 *   - Showing 3 dropdowns up front pushes the important one down.
 *
 * Each picker filters the catalog to its own capability:
 *   - chat:      any non-embedding model from any configured provider
 *   - vision:    non-embedding model from a vision-capable provider
 *   - embedding: embedding model from an embedding-capable provider
 *
 * RSC pages can't fetch() their own host without a full URL
 * (and APP_URL isn't always set on Vercel), so we share the
 * server-side `buildCatalogForUser` helper.
 */
export default async function ModelsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const { settings: userRow } = await getUserWithSettings(session.user.id);

  const catalog = await buildCatalogForUser(session.user.id);

  // The pickers only render for providers the user has a key for.
  // Showing "pick a Google model" when the user has no Google key
  // would silently no-op on save.
  const configured = catalog.providers.filter((p) => p.hasKey);
  const initialChain = userRow?.aiFallbackChain ?? [];
  const initialChatModel = userRow?.chatModel ?? null;
  const initialVisionModel = userRow?.visionModel ?? null;
  const initialEmbeddingModel = userRow?.embeddingModel ?? null;

  const allModels = catalog.providers.flatMap((p) =>
    p.models.map((m) => ({ ...m, providerName: p.displayName })),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">AI & Intelligence</h2>
        <p className="text-fg-subtle text-sm">
          Pick the model that handles every chat turn. Per-turn overrides via the chat toolbar
          still work.
        </p>
      </div>

      <AISubNav />

      <ChatModelPicker initialValue={initialChatModel} providers={configured} />

      <FallbackChainPicker initialChain={initialChain} configuredProviders={configured} />

      <details className="surface-panel overflow-hidden rounded-xl border border-white/10 shadow-[var(--shadow-chip)]">
        <summary
          aria-label="Toggle advanced model settings"
          className="hover:bg-bg-elev-2/60 flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors select-none"
        >
          <div className="flex flex-col">
            <span className="text-fg text-sm font-medium">Advanced</span>
            <span className="text-caption text-fg-subtle">
              Pick vision + embedding models independently of chat.
            </span>
          </div>
          <span className="text-caption text-fg-subtle font-mono">▾</span>
        </summary>
        <div className="border-border/50 flex flex-col gap-4 border-t p-5">
          <VisionModelPicker initialValue={initialVisionModel} providers={configured} />
          <EmbeddingModelPicker initialValue={initialEmbeddingModel} providers={configured} />
        </div>
      </details>

      <details className="surface-panel overflow-hidden rounded-xl border border-white/10 shadow-[var(--shadow-chip)]">
        <summary
          aria-label="Toggle model comparison table"
          className="hover:bg-bg-elev-2/60 flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors select-none"
        >
          <div className="flex flex-col">
            <span className="text-fg text-sm font-medium">Model Comparison</span>
            <span className="text-caption text-fg-subtle">
              Compare prices, capabilities, and tiers across all configured providers.
            </span>
          </div>
          <span className="text-caption text-fg-subtle font-mono">▾</span>
        </summary>
        <div className="border-border overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="text-fg-muted px-4 py-2.5 text-left font-medium">Provider</th>
                <th className="text-fg-muted px-4 py-2.5 text-left font-medium">Model</th>
                <th className="text-fg-muted px-4 py-2.5 text-left font-medium">Tier</th>
                <th className="text-fg-muted px-4 py-2.5 text-right font-medium">Input / 1M tok</th>
                <th className="text-fg-muted px-4 py-2.5 text-right font-medium">
                  Output / 1M tok
                </th>
                <th className="text-fg-muted px-4 py-2.5 text-center font-medium">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {allModels.map((m) => (
                <tr
                  key={`${m.providerName}:${m.modelId}`}
                  className="border-border/50 hover:bg-bg-elev-2/40 border-b last:border-0"
                >
                  <td className="text-fg px-4 py-2.5 font-medium">{m.providerName}</td>
                  <td className="text-fg px-4 py-2.5 font-mono text-xs">{m.label ?? m.modelId}</td>
                  <td className="px-4 py-2.5">
                    <span className="surface-chip bg-bg-elev-2 text-[11px] text-fg-subtle border border-white/5 inline-flex items-center rounded-md px-2 py-0.5 font-mono font-medium">
                      {m.tier ?? 'flagship'}
                    </span>
                  </td>
                  <td className="text-fg px-4 py-2.5 text-right font-mono tabular-nums">
                    {m.inputPerMTokUsd != null ? `$${m.inputPerMTokUsd.toFixed(2)}` : '—'}
                  </td>
                  <td className="text-fg px-4 py-2.5 text-right font-mono tabular-nums">
                    {m.outputPerMTokUsd != null ? `$${m.outputPerMTokUsd.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {m.tier !== 'embedding' ? (
                        <span className="surface-chip bg-success/15 text-success text-[11px] inline-flex items-center rounded-md px-2 py-0.5 font-mono font-medium">
                          Chat
                        </span>
                      ) : null}
                      {m.tier === 'embedding' ? (
                        <span className="surface-chip bg-bg-elev-3 text-fg-muted text-[11px] inline-flex items-center rounded-md px-2 py-0.5 font-mono font-medium">
                          Embed
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {allModels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-fg-subtle px-4 py-6 text-center text-sm">
                    No models available. Configure an API key first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-caption text-fg-subtle text-center">
        {catalog.total} providers · {catalog.totalModels} models in the registry
      </p>
    </div>
  );
}
