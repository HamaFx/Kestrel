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
import { IconLoader2, IconRocket } from '@tabler/icons-react';
import { useState } from 'react';

import { pluginFetch } from './api';

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const name of ['__Host-hfx_csrf', 'hfx_csrf']) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match?.[1] !== undefined) return decodeURIComponent(match[1]);
  }
  return undefined;
}

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

  const headers = new Headers({ 'content-type': 'application/json' });
  const token = csrfToken();
  if (token) headers.set('X-CSRF-Token', token);
  const response = await fetch('/api/plugins/paper-trading/strategy-runs', {
    method: 'POST',
    headers,
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
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  }
  return body?.message ?? 'Deployed to the AI Agent Sandbox.';
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

  async function onClick() {
    setState('loading');
    setMessage(null);
    try {
      const text = await deploy(runId);
      setState('deployed');
      setMessage(text);
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : String(err));
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
            ? 'border-brand/30 text-brand hover:bg-brand/10 inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold disabled:opacity-50'
            : 'border-brand/30 text-brand hover:bg-brand/10 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold disabled:opacity-50'
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
      {message ? (
        <span
          className={`max-w-64 truncate text-[9px] ${
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
