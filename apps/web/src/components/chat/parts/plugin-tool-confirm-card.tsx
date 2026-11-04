'use client';

// SPDX-License-Identifier: Apache-2.0

// Confirmation card for plugin write tools (P0-6), unified under the shared
// Aegis Human-in-the-Loop Execution Gate (`<AegisConfirmGate>`).
//
// The chat adapter returns a `plugin-tool-confirm` envelope instead of running
// a `requiresConfirmation` tool. This card re-executes the tool through the
// authenticated confirm endpoint and renders the confirmed result with the
// plugin's own chat card (or the automatic formatter).
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import type { PluginToolConfirmUi } from '@kestrel/shared';
import { IconShieldLock } from '@tabler/icons-react';
import { useState, type ReactElement } from 'react';

import { AegisConfirmGate, AegisGateDeclinedCard } from '@/components/ui/aegis-confirm-gate';
import { getCsrfToken } from '@/lib/auth/csrf';

import { PluginOutput } from './auto-plugin-tool-blocks';
import { AutoPluginToolCard } from './auto-plugin-tool-card';
import { humanizeToolName } from './auto-plugin-tool-format';

type ConfirmState = 'idle' | 'confirming' | 'done' | 'dismissed' | 'error';

interface ConfirmResponseBody {
  data?: unknown;
  error?: { message?: string };
}

/** Render the confirmed tool result with the plugin's own card when possible. */
function renderConfirmedResult(toolId: string, result: unknown): ReactElement {
  const registration = pluginUiRegistry.getToolPart(toolId);
  if (registration) {
    const PluginPart = registration.component;
    if (!registration.schema) {
      return <PluginPart output={result} state="done" />;
    }
    const parsed = registration.schema.safeParse(result);
    if (parsed.success) {
      return <PluginPart output={parsed.data} state="done" />;
    }
  }
  return <AutoPluginToolCard name={toolId} output={result} state="done" />;
}

export function PluginToolConfirmCard({ payload }: { payload: PluginToolConfirmUi }): ReactElement {
  const [state, setState] = useState<ConfirmState>('idle');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const title = humanizeToolName(payload.toolId);

  async function confirm(): Promise<void> {
    setState('confirming');
    setError(null);
    try {
      const token = getCsrfToken();
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(payload.pluginId)}/tools/${encodeURIComponent(
          payload.toolId,
        )}/confirm`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { 'x-csrf-token': token } : {}),
          },
          body: JSON.stringify({ input: payload.proposedInput }),
        },
      );
      const body = (await response.json().catch(() => null)) as ConfirmResponseBody | null;
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      setResult(body?.data ?? null);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  if (state === 'done') {
    return renderConfirmedResult(payload.toolId, result);
  }

  if (state === 'dismissed') {
    return (
      <AegisGateDeclinedCard
        ariaLabel={`${title} cancelled`}
        summary={`${title} cancelled — nothing was executed.`}
      />
    );
  }

  return (
    <AegisConfirmGate
      ariaLabel={`${title} confirmation`}
      subtitle={`Plugin Directive · ${payload.pluginId}`}
      title={
        payload.description
          ? `${title} — ${payload.description}`
          : `${title} — This action modifies plugin state.`
      }
      badgeLabel="PLUGIN WRITE"
      icon={<IconShieldLock className="size-5" strokeWidth={1.85} aria-hidden="true" />}
      confirmLabel={`Hold to Confirm ${title}`}
      cancelLabel="Cancel"
      isConfirming={state === 'confirming'}
      errorMessage={state === 'error' ? (error ?? 'Confirmation failed.') : null}
      onConfirm={confirm}
      onCancel={() => setState('dismissed')}
    >
      <div className="border-border/40 bg-bg-elev-3 text-brand flex items-center justify-between border-b px-3 py-1.5 text-[11px] font-semibold uppercase">
        <span>Proposed Tool Input</span>
        <span className="text-fg-subtle font-mono text-[10px]">{payload.toolId}</span>
      </div>
      <div className="p-3">
        <PluginOutput output={payload.proposedInput} />
      </div>
    </AegisConfirmGate>
  );
}
