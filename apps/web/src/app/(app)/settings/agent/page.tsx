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

// Phase 7c — schema-driven tool catalogue page. Lists every registered
// AI tool with its description and the last-24h invocation telemetry
// (count, failure count, p50/p95 latency). Server component — single
// DB read on render.

import { buildToolCatalogue, BYOK_PROVIDERS_LIST } from '@kestrel/ai';
import { getUserWithSettings } from '@kestrel/db';
import { TOOL_NAMES, type ToolName } from '@kestrel/shared';
import { IconSettings } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { AIPrefsCard } from '../_components/agent/ai-prefs-card';
import { AgentModelOverrideForm } from './_components/agent-model-override-form';
import { AnalysisModeForm } from './_components/analysis-mode-form';
import { DisabledToolsForm } from './_components/disabled-tools-form';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Agent | Kestrel',
  description: 'Tool catalogue and recent invocation stats.',
};

export default async function AgentCataloguePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { settings } = await getUserWithSettings(session.user.id);

  const disabledTools = settings?.disabledTools ?? [];
  const analysisMode = (settings?.defaultAnalysisMode ?? 'auto') as
    'single' | 'quick' | 'standard' | 'full' | 'auto';
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
  const entries = await buildToolCatalogue(disabledTools);
  const totalInvocations = entries.reduce((s, e) => s + e.invocations24h, 0);
  const totalFailures = entries.reduce((s, e) => s + e.failures24h, 0);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Agent</h2>
        <p className="text-fg-subtle text-sm">
          Every tool the agent can call. Counts and latencies come from{' '}
          <code className="bg-bg-elev-2 text-fg rounded-sm px-1.5 py-0.5 font-mono text-xs">
            chat_tool_telemetry
          </code>{' '}
          over the last 24 hours.
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-fg-subtle text-body-sm tabular-nums">
          last 24h · {totalInvocations} invocation{totalInvocations === 1 ? '' : 's'} ·{' '}
          {totalFailures} failure{totalFailures === 1 ? '' : 's'}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <li
            key={e.name}
            className="border-border bg-bg-elev-1 flex flex-col gap-1.5 rounded-sm border p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <code className="text-fg font-mono text-sm font-semibold">{e.name}</code>
              <div className="text-caption flex items-center gap-1.5 tabular-nums">
                <Pill label={`${e.invocations24h}×`} tone="muted" />
                {e.failures24h > 0 ? <Pill label={`${e.failures24h} fail`} tone="danger" /> : null}
                {e.invocations24h > 0 ? <Pill label={`p50 ${e.medianMs}ms`} tone="muted" /> : null}
                {e.invocations24h > 0 ? <Pill label={`p95 ${e.p95Ms}ms`} tone="muted" /> : null}
              </div>
            </div>
            <p className="text-fg-muted text-xs leading-[1.4]">{e.description}</p>
          </li>
        ))}
      </ul>

      <AnalysisModeForm initialMode={analysisMode} showOpinions={showOpinions} />

      <AgentModelOverrideForm
        initialOverrides={agentModelOverrides}
        providers={providerModelList}
      />

      <AIPrefsCard initialCustomInstructions={customInstructions} />

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
    </div>
  );
}

function Pill({ label, tone }: { label: string; tone: 'muted' | 'danger' | 'success' }) {
  const cls =
    tone === 'danger'
      ? 'bg-danger/15 text-danger'
      : tone === 'success'
        ? 'bg-success/15 text-success'
        : 'bg-bg-elev-2 text-fg-muted';
  return (
    <span className={`text-caption rounded-sm px-1.5 py-0.5 font-medium ${cls}`}>{label}</span>
  );
}
