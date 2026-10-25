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

// Platform-config state machine (useReducer) + API actions. Section cards are
// pure presentational consumers of this controller.
import { useEffect, useReducer } from 'react';
import { toast } from 'sonner';

import { apiFetch, apiMutate } from '@/lib/http/api-client';
import { toastApiError } from '@/lib/http/toast-api-error';

import {
  EMPTY_FORM,
  EMPTY_UI,
  type PlatformConfigDTO,
  type PlatformConfigForm,
  type PlatformConfigUi,
} from './types';

interface State {
  data: PlatformConfigDTO | null;
  loading: boolean;
  fetchError: string | null;
  form: PlatformConfigForm;
  ui: PlatformConfigUi;
}

type Action =
  | { type: 'loading' }
  | { type: 'loadFailed'; message: string }
  | { type: 'hydrated'; data: PlatformConfigDTO }
  | { type: 'form'; patch: Partial<PlatformConfigForm> }
  | { type: 'ui'; patch: Partial<PlatformConfigUi> }
  | { type: 'keyDraft'; providerId: string; value: string };

const INITIAL: State = {
  data: null,
  loading: true,
  fetchError: null,
  form: EMPTY_FORM,
  ui: EMPTY_UI,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, fetchError: null };
    case 'loadFailed':
      return { ...state, loading: false, fetchError: action.message };
    case 'hydrated': {
      const { routing, marketData, budget, tools } = action.data;
      return {
        data: action.data,
        loading: false,
        fetchError: null,
        form: {
          chatModel: routing.chatModel ?? '',
          visionModel: routing.visionModel ?? '',
          embeddingModel: routing.embeddingModel ?? '',
          fallbackChain: routing.aiFallbackChain ?? [],
          defaultMode: routing.defaultAnalysisMode,
          showOpinions: routing.showAgentOpinions,
          deskOverrides: routing.agentModelOverrides ?? {},
          customInstructions: routing.customInstructions ?? '',
          marketProvider: marketData.marketDataProvider,
          maxDailyUsd: budget.maxDailyUsd != null ? String(budget.maxDailyUsd) : '',
          monthlyBudgetLimit:
            budget.monthlyBudgetLimit != null ? String(budget.monthlyBudgetLimit) : '',
          disabledTools: tools.disabledTools ?? [],
        },
        ui: state.ui,
      };
    }
    case 'form':
      return { ...state, form: { ...state.form, ...action.patch } };
    case 'ui':
      return { ...state, ui: { ...state.ui, ...action.patch } };
    case 'keyDraft':
      return {
        ...state,
        ui: {
          ...state.ui,
          keyDrafts: { ...state.ui.keyDrafts, [action.providerId]: action.value },
        },
      };
  }
}

export function usePlatformConfig() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const { data, form, ui } = state;
  const setForm = (patch: Partial<PlatformConfigForm>) => dispatch({ type: 'form', patch });
  const setUi = (patch: Partial<PlatformConfigUi>) => dispatch({ type: 'ui', patch });

  async function loadConfig() {
    dispatch({ type: 'loading' });
    try {
      dispatch({
        type: 'hydrated',
        data: await apiFetch<PlatformConfigDTO>('/api/admin/platform-config'),
      });
    } catch (err) {
      dispatch({
        type: 'loadFailed',
        message: err instanceof Error ? err.message : 'Failed to load platform configuration',
      });
    }
  }

  useEffect(() => {
    void loadConfig();
    // Load once; section actions refresh explicitly.
  }, []);

  const patchConfig = (body: Record<string, unknown>) =>
    apiMutate('/api/admin/platform-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  async function saveProviderKey(providerId: string) {
    const raw = (ui.keyDrafts[providerId] ?? '').trim();
    if (!raw) return toast.error('Enter an API key first');
    setUi({ busyProvider: providerId });
    try {
      const res = await apiMutate<{ ok: boolean; testOk: boolean; testError: string | null }>(
        '/api/admin/platform-config',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_api_key', providerId, apiKey: raw }),
        },
      );
      dispatch({ type: 'keyDraft', providerId, value: '' });
      if (res.testOk) toast.success(`Saved & verified ${providerId} API key`);
      else
        toast.warning(
          `Saved ${providerId} key, but health check failed: ${res.testError ?? 'check key'}`,
        );
      await loadConfig();
    } catch (err) {
      toastApiError(err, `Failed to save ${providerId} key`);
    } finally {
      setUi({ busyProvider: null });
    }
  }

  async function clearProviderKey(providerId: string) {
    setUi({ busyProvider: providerId });
    try {
      await patchConfig({ action: 'clear_api_key', providerId });
      toast.success(`Cleared stored database key for ${providerId}`);
      await loadConfig();
    } catch (err) {
      toastApiError(err, `Failed to clear ${providerId} key`);
    } finally {
      setUi({ busyProvider: null });
    }
  }

  async function testProvider(providerId: string) {
    setUi({ busyProvider: providerId });
    try {
      const res = await apiMutate<{ ok: boolean; error?: string }>('/api/settings/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId }),
      });
      if (res.ok) toast.success(`${providerId} connection verified`);
      else toast.error(`${providerId} check failed: ${res.error ?? 'Unknown error'}`);
      await loadConfig();
    } catch (err) {
      toastApiError(err, `Failed to test ${providerId}`);
    } finally {
      setUi({ busyProvider: null });
    }
  }

  async function bulkTestProviders() {
    setUi({ bulkTesting: true });
    try {
      await apiMutate('/api/settings/bulk-test', { method: 'POST' });
      toast.success('Tested all configured AI providers');
      await loadConfig();
    } catch (err) {
      toastApiError(err, 'Failed to bulk-test providers');
    } finally {
      setUi({ bulkTesting: false });
    }
  }

  async function saveRouting() {
    setUi({ savingRouting: true });
    try {
      await patchConfig({
        action: 'update_routing',
        chatModel: form.chatModel.trim() || null,
        visionModel: form.visionModel.trim() || null,
        embeddingModel: form.embeddingModel.trim() || null,
        aiFallbackChain: form.fallbackChain,
        defaultAnalysisMode: form.defaultMode,
        showAgentOpinions: form.showOpinions,
        agentModelOverrides: form.deskOverrides,
        customInstructions: form.customInstructions,
      });
      toast.success('Global model routing & committee defaults saved for all subscribers');
      await loadConfig();
    } catch (err) {
      toastApiError(err, 'Failed to save model routing');
    } finally {
      setUi({ savingRouting: false });
    }
  }

  function toggleFallbackProvider(providerId: string) {
    setForm({
      fallbackChain: form.fallbackChain.includes(providerId)
        ? form.fallbackChain.filter((id) => id !== providerId)
        : [...form.fallbackChain, providerId],
    });
  }

  async function testMarketProvider() {
    setUi({ testingMarket: true, marketTestResult: null });
    try {
      const res = await apiMutate<{ ok: boolean; error?: string }>(
        '/api/settings/test-market-provider',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: form.marketProvider }),
        },
      );
      setUi({
        marketTestResult: res.ok
          ? { ok: true, message: 'Feed connection verified and online.' }
          : { ok: false, message: res.error ?? 'Market data feed test failed.' },
      });
    } catch (err) {
      setUi({
        marketTestResult: {
          ok: false,
          message: err instanceof Error ? err.message : 'Market feed test failed.',
        },
      });
    } finally {
      setUi({ testingMarket: false });
    }
  }

  async function saveMarketData() {
    setUi({ savingMarket: true });
    try {
      await patchConfig({ action: 'update_market_data', marketDataProvider: form.marketProvider });
      toast.success(`Platform market feed set to ${form.marketProvider}`);
      await loadConfig();
    } catch (err) {
      toastApiError(err, 'Failed to update market data provider');
    } finally {
      setUi({ savingMarket: false });
    }
  }

  async function saveBudget() {
    setUi({ savingBudget: true });
    try {
      const daily = form.maxDailyUsd.trim() ? Number.parseFloat(form.maxDailyUsd.trim()) : null;
      const monthly = form.monthlyBudgetLimit.trim()
        ? Number.parseInt(form.monthlyBudgetLimit.trim(), 10)
        : null;
      await patchConfig({
        action: 'update_budget',
        maxDailyUsd: daily != null && !Number.isNaN(daily) ? daily : null,
        monthlyBudgetLimit: monthly != null && !Number.isNaN(monthly) ? monthly : null,
      });
      toast.success('Platform spend guardrails updated');
      await loadConfig();
    } catch (err) {
      toastApiError(err, 'Failed to update spend guardrails');
    } finally {
      setUi({ savingBudget: false });
    }
  }

  async function toggleTool(toolName: string, enabled: boolean) {
    const nextDisabled = enabled
      ? form.disabledTools.filter((t) => t !== toolName)
      : Array.from(new Set([...form.disabledTools, toolName]));
    setForm({ disabledTools: nextDisabled });
    setUi({ savingTools: true });
    try {
      await patchConfig({ action: 'update_disabled_tools', disabledTools: nextDisabled });
      toast.success(`${toolName} ${enabled ? 'enabled' : 'disabled'} globally`);
    } catch (err) {
      toastApiError(err, 'Failed to update agent tool status');
      await loadConfig();
    } finally {
      setUi({ savingTools: false });
    }
  }

  return {
    state,
    data,
    form,
    ui,
    setForm,
    setUi,
    dispatch,
    loadConfig,
    saveProviderKey,
    clearProviderKey,
    testProvider,
    bulkTestProviders,
    saveRouting,
    toggleFallbackProvider,
    testMarketProvider,
    saveMarketData,
    saveBudget,
    toggleTool,
  };
}

export type PlatformConfigController = ReturnType<typeof usePlatformConfig>;
