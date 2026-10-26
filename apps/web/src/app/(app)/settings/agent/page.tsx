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

// Personal agent preferences for every signed-in user: analysis mode,
// custom instructions, per-desk model overrides, and the tool on/off
// switches. Server component — settings read + (admin-only) catalogue
// read on render.
//
// Phase 3 — the raw 24h `chat_tool_telemetry` catalogue used to sit at
// the top of this page even though it aggregates across the whole
// platform. It is operator-only now and links through to
// /admin?tab=telemetry, while the user-facing preference forms moved
// up the page.

import { buildToolCatalogue, BYOK_PROVIDERS_LIST } from '@kestrel/ai';
import { getUserWithSettings } from '@kestrel/db';
import { TOOL_NAMES, type ToolName } from '@kestrel/shared';
import { IconActivity, IconSettings } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { checkIsAdmin } from '@/lib/auth/admin-check';

import { AIPrefsCard } from '../_components/agent/ai-prefs-card';
import { AISubNav } from '../_components/ai-subnav';
import { AgentModelOverrideForm } from './_components/agent-model-override-form';
import { AnalysisModeForm } from './_components/analysis-mode-form';
import { DisabledToolsForm } from './_components/disabled-tools-form';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Agent | Kestrel',
  description: 'Analysis mode, custom instructions, model overrides, and tool access.',
};

export default async function AgentCataloguePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const isAdmin = await checkIsAdmin();

  const { settings } = await getUserWithSettings(session.user.id);

  const disabledTools = settings?.disabledTools ?? [];
  // The form normalizes legacy persisted values onto the two-mode schema (Q2).
  const analysisMode = settings?.defaultAnalysisMode ?? 'single';
  const showOpinions = settings?.showAgentOpinions ?? true;
  const agentModelOverrides =
    (settings?.agentModelOverrides as {
      technical?: string;
      fundamental?: string;
      risk?: string;
      sentiment?: string;
      decision?: string;
    } | null) ?? {};

  const customInstructions = settings?.customInstructions ?? null;

  // Build the provider+model list for the override dropdowns.
  const providerModelList = BYOK_PROVIDERS_LIST.map((p) => ({
    id: p.id as string,
    displayName: p.displayName,
    models: (p.models ?? []).map((m) => ({
      modelId: m.modelId,
      ...(m.label !== undefined ? { label: m.label } : {}),
      ...(m.tier !== undefined ? { tier: m.tier } : {}),
    })),
  }));

  // Operator-only: global 24h invocation telemetry across every user.
  const entries = isAdmin ? await buildToolCatalogue(disabledTools) : [];
  const totalInvocations = entries.reduce((s, e) => s + e.invocations24h, 0);
  const totalFailures = entries.reduce((s, e) => s + e.failures24h, 0);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">AI & Intelligence</h2>
        <p className="text-fg-subtle text-sm">
          Choose how the committee analyses markets, write custom instructions, and pin models to
          individual desks.
        </p>
      </div>

      <AISubNav />

      <AnalysisModeForm initialMode={analysisMode} showOpinions={showOpinions} />

      <AIPrefsCard initialCustomInstructions={customInstructions} />

      <AgentModelOverrideForm
        initialOverrides={agentModelOverrides}
        providers={providerModelList}
      />

      <section aria-labelledby="disabled-tools-heading" className="flex flex-col gap-3">
        <header className="flex items-center gap-2">
          <IconSettings className="text-fg-muted size-4" />
          <h2 id="disabled-tools-heading" className="text-fg-muted text-sm font-medium">
            Disabled Tools
          </h2>
        </header>
        <p className="text-fg-muted text-xs">
          Toggle tools off to prevent the agent from calling them. Disabled tools still appear in
          the catalogue but are excluded from the agent&apos;s available toolset.
        </p>
        <DisabledToolsForm
          allTools={TOOL_NAMES as unknown as ToolName[]}
          initialDisabledTools={disabledTools}
        />
      </section>

      {isAdmin ? (
        <section aria-labelledby="tool-telemetry-heading" className="flex flex-col gap-3">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconActivity className="text-fg-muted size-4" />
              <h2 id="tool-telemetry-heading" className="text-fg-muted text-sm font-medium">
                Tool Catalogue · 24h Telemetry
              </h2>
            </div>
            <Link
              href="/admin?tab=telemetry"
              className="text-brand text-xs font-semibold hover:underline"
            >
              Open in Admin →
            </Link>
          </header>
          <p className="text-fg-muted text-xs">
            Platform-wide tool invocation counts and latencies from{' '}
            <code className="surface-well text-fg rounded-md border border-white/5 px-1.5 py-0.5 font-mono text-xs">
              chat_tool_telemetry
            </code>
            . Operator-only.
          </p>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-fg-subtle text-xs tabular-nums">
              last 24h · {totalInvocations} invocation{totalInvocations === 1 ? '' : 's'} ·{' '}
              {totalFailures} failure{totalFailures === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="flex flex-col gap-2.5">
            {entries.map((e) => (
              <li
                key={e.name}
                className="surface-panel flex flex-col gap-2 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <code className="text-fg font-mono text-sm font-semibold">{e.name}</code>
                  <div className="text-caption flex items-center gap-1.5 tabular-nums">
                    <Pill label={`${e.invocations24h}×`} tone="muted" />
                    {e.failures24h > 0 ? (
                      <Pill label={`${e.failures24h} fail`} tone="danger" />
                    ) : null}
                    {e.invocations24h > 0 ? (
                      <Pill label={`p50 ${e.medianMs}ms`} tone="muted" />
                    ) : null}
                    {e.invocations24h > 0 ? <Pill label={`p95 ${e.p95Ms}ms`} tone="muted" /> : null}
                  </div>
                </div>
                <p className="text-fg-muted text-xs leading-[1.4]">{e.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Pill({ label, tone }: { label: string; tone: 'muted' | 'danger' | 'success' }) {
  const cls =
    tone === 'danger'
      ? 'bg-danger/15 text-danger'
      : tone === 'success'
        ? 'bg-success/15 text-success'
        : 'surface-chip bg-bg-elev-2 text-fg-muted border border-white/5';
  return (
    <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}
