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
import {
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconCpu,
  IconDatabase,
  IconKey,
  IconRefresh,
  IconShieldLock,
  IconTool,
  IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { formatRelative } from '@/lib/format';
import { toastApiError } from '@/lib/toast-api-error';

import { AdminErrorBlock } from './admin-error-block';

interface ProviderModelItem {
  modelId: string;
  label?: string;
  tier?: string;
  inputPerMTokUsd?: number | null;
  outputPerMTokUsd?: number | null;
}

interface PlatformProviderDTO {
  id: string;
  displayName: string;
  hasKey: boolean;
  hasDbKey: boolean;
  updatedAt: string | null;
  health: {
    ok: boolean;
    error: string | null;
    testedAt: string;
  } | null;
  usage30d: {
    turns: number;
    costUsd: number;
  };
  models: ProviderModelItem[];
}

interface ToolCatalogueEntry {
  name: string;
  description: string;
  invocations24h: number;
  failures24h: number;
  medianMs: number;
  p95Ms: number;
  disabled: boolean;
}

interface PlatformConfigDTO {
  providers: PlatformProviderDTO[];
  routing: {
    chatModel: string | null;
    visionModel: string | null;
    embeddingModel: string | null;
    aiFallbackChain: string[];
    defaultAnalysisMode: 'single' | 'full';
    showAgentOpinions: boolean;
    agentModelOverrides: Record<string, string>;
    customInstructions: string;
  };
  marketData: {
    marketDataProvider: 'biquote' | 'finnhub' | 'live-ticks';
    finnhubKeySet: boolean;
  };
  tools: {
    catalogue: ToolCatalogueEntry[];
    disabledTools: string[];
    allTools: string[];
  };
  budget: {
    monthlyBudgetLimit: number | null;
    maxDailyUsd: number | null;
    todayTurns: number;
    todayUsd: number;
    thirtyDayTurns: number;
    thirtyDayUsd: number;
  };
}

const SPECIALIST_DESKS: Array<{
  key: 'technical' | 'fundamental' | 'sentiment' | 'risk' | 'decision';
  label: string;
  description: string;
}> = [
  {
    key: 'technical',
    label: 'Technical Desk',
    description: 'Price action, structure, support/resistance, and indicators',
  },
  {
    key: 'fundamental',
    label: 'Macro & Fundamental Desk',
    description: 'Central banks, economic calendar, yields, and COT positioning',
  },
  {
    key: 'sentiment',
    label: 'Sentiment Desk',
    description: 'News flow, crowd positioning, and session bias',
  },
  {
    key: 'risk',
    label: 'Risk & Guardrails Desk',
    description: 'Invalidation zones, position sizing, and event risk checks',
  },
  {
    key: 'decision',
    label: 'Decision Synthesis',
    description: 'Final trade plan synthesis across all 4 specialist desks',
  },
];

export function AdminPlatformConfig() {
  const [data, setData] = useState<PlatformConfigDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Per-provider API key inputs & busy states
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [bulkTesting, setBulkTesting] = useState(false);

  // Routing form states
  const [chatModel, setChatModel] = useState<string>('');
  const [visionModel, setVisionModel] = useState<string>('');
  const [embeddingModel, setEmbeddingModel] = useState<string>('');
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);
  const [defaultMode, setDefaultMode] = useState<'single' | 'full'>('single');
  const [showOpinions, setShowOpinions] = useState<boolean>(true);
  const [deskOverrides, setDeskOverrides] = useState<Record<string, string>>({});
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [savingRouting, setSavingRouting] = useState(false);

  // Market data & budget states
  const [marketProvider, setMarketProvider] = useState<'biquote' | 'finnhub' | 'live-ticks'>(
    'biquote',
  );
  const [testingMarket, setTestingMarket] = useState(false);
  const [marketTestResult, setMarketTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [savingMarket, setSavingMarket] = useState(false);

  const [maxDailyUsd, setMaxDailyUsd] = useState<string>('');
  const [monthlyBudgetLimit, setMonthlyBudgetLimit] = useState<string>('');
  const [savingBudget, setSavingBudget] = useState(false);

  // Disabled tools state
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [savingTools, setSavingTools] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await apiFetch<PlatformConfigDTO>('/api/admin/platform-config');
      setData(res);
      setChatModel(res.routing.chatModel ?? '');
      setVisionModel(res.routing.visionModel ?? '');
      setEmbeddingModel(res.routing.embeddingModel ?? '');
      setFallbackChain(res.routing.aiFallbackChain ?? []);
      setDefaultMode(res.routing.defaultAnalysisMode);
      setShowOpinions(res.routing.showAgentOpinions);
      setDeskOverrides(res.routing.agentModelOverrides ?? {});
      setCustomInstructions(res.routing.customInstructions ?? '');
      setMarketProvider(res.marketData.marketDataProvider);
      setMaxDailyUsd(res.budget.maxDailyUsd != null ? String(res.budget.maxDailyUsd) : '');
      setMonthlyBudgetLimit(
        res.budget.monthlyBudgetLimit != null ? String(res.budget.monthlyBudgetLimit) : '',
      );
      setDisabledTools(res.tools.disabledTools ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load platform configuration';
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleSaveProviderKey(providerId: string) {
    const raw = (keyDrafts[providerId] ?? '').trim();
    if (!raw) {
      toast.error('Enter an API key first');
      return;
    }
    setBusyProvider(providerId);
    try {
      const res = await apiMutate<{ ok: boolean; testOk: boolean; testError: string | null }>(
        '/api/admin/platform-config',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_api_key',
            providerId,
            apiKey: raw,
          }),
        },
      );
      setKeyDrafts((prev) => ({ ...prev, [providerId]: '' }));
      if (res.testOk) {
        toast.success(`Saved & verified ${providerId} API key`);
      } else {
        toast.warning(
          `Saved ${providerId} key, but health check failed: ${res.testError ?? 'check key'}`,
        );
      }
      await loadConfig();
    } catch (err) {
      toastApiError(err, `Failed to save ${providerId} key`);
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleClearProviderKey(providerId: string) {
    setBusyProvider(providerId);
    try {
      await apiMutate('/api/admin/platform-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_api_key',
          providerId,
        }),
      });
      toast.success(`Cleared stored database key for ${providerId}`);
      await loadConfig();
    } catch (err) {
      toastApiError(err, `Failed to clear ${providerId} key`);
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleTestSingleProvider(providerId: string) {
    setBusyProvider(providerId);
    try {
      const res = await apiMutate<{ ok: boolean; error?: string }>('/api/settings/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId }),
      });
      if (res.ok) {
        toast.success(`${providerId} connection verified`);
      } else {
        toast.error(`${providerId} check failed: ${res.error ?? 'Unknown error'}`);
      }
      await loadConfig();
    } catch (err) {
      toastApiError(err, `Failed to test ${providerId}`);
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleBulkTestProviders() {
    setBulkTesting(true);
    try {
      await apiMutate('/api/settings/bulk-test', {
        method: 'POST',
      });
      toast.success('Tested all configured AI providers');
      await loadConfig();
    } catch (err) {
      toastApiError(err, 'Failed to bulk-test providers');
    } finally {
      setBulkTesting(false);
    }
  }

  async function handleSaveRouting() {
    setSavingRouting(true);
    try {
      await apiMutate('/api/admin/platform-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_routing',
          chatModel: chatModel.trim() || null,
          visionModel: visionModel.trim() || null,
          embeddingModel: embeddingModel.trim() || null,
          aiFallbackChain: fallbackChain,
          defaultAnalysisMode: defaultMode,
          showAgentOpinions: showOpinions,
          agentModelOverrides: deskOverrides,
          customInstructions,
        }),
      });
      toast.success('Global model routing & committee defaults saved for all subscribers');
      await loadConfig();
    } catch (err) {
      toastApiError(err, 'Failed to save model routing');
    } finally {
      setSavingRouting(false);
    }
  }

  function toggleFallbackProvider(providerId: string) {
    setFallbackChain((prev) =>
      prev.includes(providerId) ? prev.filter((p) => p !== providerId) : [...prev, providerId],
    );
  }

  async function handleTestMarketProvider() {
    setTestingMarket(true);
    setMarketTestResult(null);
    try {
      const res = await apiMutate<{ ok: boolean; error?: string }>(
        '/api/settings/test-market-provider',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: marketProvider }),
        },
      );
      if (res.ok) {
        setMarketTestResult({ ok: true, message: 'Feed connection verified and online.' });
      } else {
        setMarketTestResult({
          ok: false,
          message: res.error ?? 'Market data feed test failed.',
        });
      }
    } catch (err) {
      setMarketTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Market feed test failed.',
      });
    } finally {
      setTestingMarket(false);
    }
  }

  async function handleSaveMarketData() {
    setSavingMarket(true);
    try {
      await apiMutate('/api/admin/platform-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_market_data',
          marketDataProvider: marketProvider,
        }),
      });
      toast.success(`Platform market feed set to ${marketProvider}`);
      await loadConfig();
    } catch (err) {
      toastApiError(err, 'Failed to update market data provider');
    } finally {
      setSavingMarket(false);
    }
  }

  async function handleSaveBudget() {
    setSavingBudget(true);
    try {
      const parsedDaily =
        maxDailyUsd.trim().length > 0 ? Number.parseFloat(maxDailyUsd.trim()) : null;
      const parsedMonthly =
        monthlyBudgetLimit.trim().length > 0
          ? Number.parseInt(monthlyBudgetLimit.trim(), 10)
          : null;
      await apiMutate('/api/admin/platform-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_budget',
          maxDailyUsd: parsedDaily != null && !Number.isNaN(parsedDaily) ? parsedDaily : null,
          monthlyBudgetLimit:
            parsedMonthly != null && !Number.isNaN(parsedMonthly) ? parsedMonthly : null,
        }),
      });
      toast.success('Platform spend guardrails updated');
      await loadConfig();
    } catch (err) {
      toastApiError(err, 'Failed to update spend guardrails');
    } finally {
      setSavingBudget(false);
    }
  }

  async function handleToggleTool(toolName: string, enabled: boolean) {
    const nextDisabled = enabled
      ? disabledTools.filter((t) => t !== toolName)
      : Array.from(new Set([...disabledTools, toolName]));
    setDisabledTools(nextDisabled);
    setSavingTools(true);
    try {
      await apiMutate('/api/admin/platform-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_disabled_tools',
          disabledTools: nextDisabled,
        }),
      });
      toast.success(`${toolName} ${enabled ? 'enabled' : 'disabled'} globally`);
    } catch (err) {
      toastApiError(err, 'Failed to update agent tool status');
      await loadConfig();
    } finally {
      setSavingTools(false);
    }
  }

  if (loading && !data) {
    return <SkeletonCard lines={6} />;
  }

  if (fetchError || !data) {
    return (
      <SettingsSection
        title="Platform AI, Models & Market Feeds"
        description="Global SaaS configuration for all Kestrel subscribers."
      >
        <AdminErrorBlock
          message={fetchError ?? 'Unable to load platform configuration'}
          onRetry={loadConfig}
        />
      </SettingsSection>
    );
  }

  const configuredProviders = data.providers.filter((p) => p.hasKey);
  const allChatModels = data.providers.flatMap((p) =>
    p.models
      .filter((m) => m.tier !== 'embedding')
      .map((m) => ({
        qualifiedId: `${p.id}:${m.modelId}`,
        providerId: p.id,
        providerName: p.displayName,
        hasKey: p.hasKey,
        label: m.label ?? m.modelId,
        tier: m.tier ?? 'standard',
      })),
  );
  const allEmbeddingModels = data.providers.flatMap((p) =>
    p.models
      .filter((m) => m.tier === 'embedding')
      .map((m) => ({
        qualifiedId: `${p.id}:${m.modelId}`,
        providerName: p.displayName,
        hasKey: p.hasKey,
        label: m.label ?? m.modelId,
      })),
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Top Platform Telemetry Banner */}
      <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand/15 text-brand flex size-10 items-center justify-center rounded-lg border border-amber-400/20">
              <IconShieldLock className="size-5" />
            </div>
            <div>
              <h2 className="text-fg text-base font-semibold">
                Global SaaS AI & Market Data Control Plane
              </h2>
              <p className="text-caption text-fg-subtle">
                Keys, model routing, market data feeds, and tool switches configured here power all
                subscriber accounts across Kestrel.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={bulkTesting}
              disabled={configuredProviders.length === 0}
              onClick={handleBulkTestProviders}
            >
              <IconRefresh className="mr-1.5 size-3.5" />
              Test All Providers
            </Button>
          </div>
        </div>

        <div className="border-border grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-caption text-fg-muted">Active AI Providers</span>
            <span className="text-fg mt-0.5 text-lg font-semibold tabular-nums">
              {configuredProviders.length} / {data.providers.length}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-fg-muted">Platform Turns (Today / 30d)</span>
            <span className="text-fg mt-0.5 text-lg font-semibold tabular-nums">
              {data.budget.todayTurns} / {data.budget.thirtyDayTurns}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-fg-muted">Platform API Spend (Today)</span>
            <span className="text-fg mt-0.5 font-mono text-lg font-semibold tabular-nums">
              ${data.budget.todayUsd.toFixed(4)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-fg-muted">Platform API Spend (30d)</span>
            <span className="text-fg mt-0.5 font-mono text-lg font-semibold tabular-nums">
              ${data.budget.thirtyDayUsd.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 1. AI Provider Keys & Health */}
      <SettingsSection
        title="1. Platform AI Provider Keys & Connection Health"
        description="Add, rotate, or test encrypted provider API keys stored in the database (or supplied via server environment variables)."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.providers.map((p) => {
            const isBusy = busyProvider === p.id;
            const draftVal = keyDrafts[p.id] ?? '';
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
                        onClick={() => handleTestSingleProvider(p.id)}
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
                        onClick={() => handleClearProviderKey(p.id)}
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
                    onChange={(e) => setKeyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={isBusy}
                    disabled={!draftVal.trim()}
                    onClick={() => handleSaveProviderKey(p.id)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* 2. Global Model Routing, Fallback Chain & Desk Overrides */}
      <SettingsSection
        title="2. Global Model Routing & 4-Analyst Committee Configuration"
        description="Choose the default models, provider fallback order, and per-desk specialist models used for all subscriber conversations."
      >
        <div className="border-border bg-bg-elev-1 flex flex-col gap-5 rounded-lg border p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-fg text-xs font-semibold">Default Subscriber Chat Model</label>
              <select
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                className="border-border bg-bg-elev-2 text-fg rounded-sm border px-3 py-2 text-xs"
              >
                <option value="">Automatic (Highest-priority active provider)</option>
                {allChatModels.map((m) => (
                  <option key={m.qualifiedId} value={m.qualifiedId}>
                    {m.providerName} — {m.label} ({m.tier}){!m.hasKey ? ' [No Key]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-fg text-xs font-semibold">
                Vision / Chart Screenshot Model
              </label>
              <select
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
                className="border-border bg-bg-elev-2 text-fg rounded-sm border px-3 py-2 text-xs"
              >
                <option value="">Automatic Vision Default</option>
                {allChatModels.map((m) => (
                  <option key={m.qualifiedId} value={m.qualifiedId}>
                    {m.providerName} — {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-fg text-xs font-semibold">Memory & RAG Embedding Model</label>
              <select
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                className="border-border bg-bg-elev-2 text-fg rounded-sm border px-3 py-2 text-xs"
              >
                <option value="">Automatic Embedding Default</option>
                {allEmbeddingModels.map((m) => (
                  <option key={m.qualifiedId} value={m.qualifiedId}>
                    {m.providerName} — {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fallback Chain */}
          <div className="border-border flex flex-col gap-2 border-t pt-4">
            <span className="text-fg text-xs font-semibold">
              Provider Fallback Chain (click to add/remove in failover order)
            </span>
            <div className="flex flex-wrap gap-2">
              {data.providers.map((p) => {
                const idx = fallbackChain.indexOf(p.id);
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

          {/* Default Analysis Mode & Per-Desk Specialist Overrides */}
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
                <button
                  type="button"
                  onClick={() => setDefaultMode('single')}
                  className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${
                    defaultMode === 'single'
                      ? 'border-brand bg-brand/15 text-fg'
                      : 'border-border bg-bg-elev-2 text-fg-subtle'
                  }`}
                >
                  Quick Read (Single Desk)
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultMode('full')}
                  className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${
                    defaultMode === 'full'
                      ? 'border-brand bg-brand/15 text-fg'
                      : 'border-border bg-bg-elev-2 text-fg-subtle'
                  }`}
                >
                  Full Committee (4 Desks)
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-fg text-xs font-semibold">
                  Show Individual Analyst Desk Breakdowns
                </span>
                <p className="text-caption text-fg-subtle">
                  Display Technical, Macro, Sentiment, and Risk cards inside Full Committee reports.
                </p>
              </div>
              <Switch
                checked={showOpinions}
                onCheckedChange={setShowOpinions}
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
                    value={deskOverrides[desk.key] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDeskOverrides((prev) => {
                        const next = { ...prev };
                        if (!val) delete next[desk.key];
                        else next[desk.key] = val;
                        return next;
                      });
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

            <div className="flex flex-col gap-1.5">
              <label className="text-fg text-xs font-semibold">
                Global Platform Instructions (Optional)
              </label>
              <textarea
                rows={2}
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Optional house style or risk framing instructions applied across subscriber chat turns..."
                className="border-border bg-bg-elev-2 text-fg rounded-sm border p-2.5 text-xs"
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={savingRouting}
                onClick={handleSaveRouting}
              >
                <IconCheck className="mr-1.5 size-3.5" />
                Save Global Routing & Committee Config
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 3. Market Data Feed Adapter & Platform Spend Guardrails */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SettingsSection
          title="3. Live Market Data Feed Adapter"
          description="Select the market data source used for live prices, candles, and technical indicators across all subscribers."
        >
          <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-lg border p-5">
            {(
              [
                {
                  id: 'biquote',
                  name: 'BiQuote REST Feed',
                  desc: 'Zero-config REST feed for Gold, FX, and Crypto pairs.',
                },
                {
                  id: 'finnhub',
                  name: 'Finnhub Institutional REST',
                  desc: 'High-depth historical candles and multi-timeframe feeds (requires Finnhub key).',
                },
                {
                  id: 'live-ticks',
                  name: 'Live Ticks Worker Cache',
                  desc: 'Low-latency tick worker reading directly from the local database.',
                },
              ] as const
            ).map((item) => (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3 text-xs ${
                  marketProvider === item.id
                    ? 'border-brand bg-brand/10'
                    : 'border-border bg-bg-elev-2/40'
                }`}
              >
                <input
                  type="radio"
                  name="adminMarketProvider"
                  checked={marketProvider === item.id}
                  onChange={() => {
                    setMarketProvider(item.id);
                    setMarketTestResult(null);
                  }}
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-fg font-semibold">{item.name}</span>
                  <span className="text-fg-subtle">{item.desc}</span>
                </div>
              </label>
            ))}

            {marketTestResult && (
              <div
                className={`flex items-center gap-2 text-xs ${
                  marketTestResult.ok ? 'text-success' : 'text-danger'
                }`}
              >
                {marketTestResult.ok ? (
                  <IconCircleCheck className="size-4 shrink-0" />
                ) : (
                  <IconCircleX className="size-4 shrink-0" />
                )}
                <span>{marketTestResult.message}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={testingMarket}
                onClick={handleTestMarketProvider}
              >
                <IconDatabase className="mr-1.5 size-3.5" />
                Test Feed
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={savingMarket}
                onClick={handleSaveMarketData}
              >
                Save Feed Adapter
              </Button>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="4. Platform Spend Guardrails"
          description="Set daily and monthly wholesale LLM spend thresholds for operator alerts and cost governance."
        >
          <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-lg border p-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-fg text-xs font-semibold">
                Daily Spend Guardrail (USD / day)
              </label>
              <Input
                type="number"
                step="0.5"
                placeholder="e.g. 25.00"
                value={maxDailyUsd}
                onChange={(e) => setMaxDailyUsd(e.target.value)}
              />
              <span className="text-caption text-fg-subtle">
                Current today spend: ${data.budget.todayUsd.toFixed(4)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-fg text-xs font-semibold">
                Monthly Spend Alert Threshold (USD / month)
              </label>
              <Input
                type="number"
                step="5"
                placeholder="e.g. 500"
                value={monthlyBudgetLimit}
                onChange={(e) => setMonthlyBudgetLimit(e.target.value)}
              />
              <span className="text-caption text-fg-subtle">
                Current 30-day spend: ${data.budget.thirtyDayUsd.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={savingBudget}
                onClick={handleSaveBudget}
              >
                Save Spend Guardrails
              </Button>
            </div>
          </div>
        </SettingsSection>
      </div>

      {/* 5. Agent Tool Controls & 24h Telemetry */}
      <SettingsSection
        title="5. Global Agent Tool Switches & 24h Telemetry"
        description="Enable or disable individual research tools across all subscriber chat sessions and monitor real-time tool latency."
      >
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {data.tools.catalogue.map((tool) => {
            const isEnabled = !disabledTools.includes(tool.name);
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
                  disabled={savingTools}
                  onCheckedChange={(checked) => handleToggleTool(tool.name, checked)}
                  srLabel={`Toggle ${tool.name}`}
                />
              </div>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}
