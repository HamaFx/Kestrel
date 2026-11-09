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
import { createPluginFetcher } from '@kestrel/plugin-sdk/ui';
import { IconLoader2, IconRocket } from '@tabler/icons-react';
import { useState } from 'react';

import { pluginFetch } from './api';

/** Cross-plugin deploy target: the Paper Trading broker's own API. */
const paperFetch = createPluginFetcher('paper-trading');

async function deploy(runId: string): Promise<string> {
  const detail = await pluginFetch<{
    run: {
      name: string;
      symbol: string;
      timeframe: string;
      source: string;
      params: Record<string, unknown>;
    };
  }>(`/runs/${encodeURIComponent(runId)}`);

  const body = await paperFetch<{ message?: string }>('/strategy-runs', {
    method: 'POST',
    body: JSON.stringify({
      name: detail.run.name,
      strategyId: runId,
      symbol: detail.run.symbol,
      timeframe: detail.run.timeframe,
      source: detail.run.source,
      params: detail.run.params,
      riskPct: 1,
      account: 'sandbox',
    }),
  });
  return body.message ?? 'Deployed to the AI Agent Sandbox.';
}

/** True when the failure is "the Paper Trading plugin is not installed". */
function isPaperPluginMissing(message: string): boolean {
  return /not installed|PLUGIN_NOT_INSTALLED/i.test(message);
}

export function DeployToPaperButton({
  runId,
  compact = false,
}: {
  runId: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'deployed' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [paperMissing, setPaperMissing] = useState(false);

  async function onClick() {
    setState('loading');
    setMessage(null);
    setPaperMissing(false);
    try {
      const text = await deploy(runId);
      setState('deployed');
      setMessage(text);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setState('error');
      setPaperMissing(isPaperPluginMissing(text));
      setMessage(text);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={state === 'loading' || state === 'deployed'}
        className={
          compact
            ? 'border-brand/30 text-brand hover:bg-brand/10 inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold disabled:opacity-50'
            : 'border-brand/30 text-brand hover:bg-brand/10 inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50'
        }
        title="Deploy this exact strategy to the autonomous paper sandbox"
      >
        {state === 'loading' ? (
          <IconLoader2 className="size-3.5 animate-spin" />
        ) : (
          <IconRocket className="size-3.5" />
        )}
        {state === 'deployed' ? 'Deployed' : 'Deploy to Paper'}
      </button>
      {paperMissing ? (
        <span className="text-danger max-w-64 text-[11px]">
          Paper Trading isn&apos;t installed —{' '}
          <a href="/settings/plugins" className="underline">
            install it in Settings → Plugins
          </a>
        </span>
      ) : message ? (
        <span
          className={`max-w-64 truncate text-[11px] ${
            state === 'error' ? 'text-danger' : 'text-fg-subtle'
          }`}
          title={message}
        >
          {message}
        </span>
      ) : null}
    </span>
  );
}
