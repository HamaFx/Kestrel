'use client';

// SPDX-License-Identifier: Apache-2.0

// One-click confirmation card for plugin write tools (P0-6).
//
// The chat adapter returns a `plugin-tool-confirm` envelope instead of running
// a `requiresConfirmation` tool. This card re-executes the tool through the
// authenticated confirm endpoint and renders the confirmed result with the
// plugin's own chat card (or the automatic formatter).
import { pluginUiRegistry } from '@kestrel/plugin-sdk/ui';
import type { PluginToolConfirmUi } from '@kestrel/shared';
import { IconCheck, IconShieldLock, IconX } from '@tabler/icons-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
      <div className="border-divider text-fg-subtle flex items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-xs">
        <IconX className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{title} cancelled — nothing was executed.</span>
      </div>
    );
  }

  return (
    <section
      aria-label={`${title} confirmation`}
      className="surface-panel flex flex-col gap-3 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-start gap-2.5">
        <span className="bg-warn/10 text-warn flex size-9 shrink-0 items-center justify-center rounded-md">
          <IconShieldLock className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-fg flex flex-wrap items-center gap-2 text-sm font-semibold">
            {title}
            <Badge tone="warn">needs confirmation</Badge>
          </h3>
          <p className="text-fg-muted line-clamp-3 text-xs">
            {payload.description || 'This action changes your plugin data.'} Nothing runs until you
            confirm.
          </p>
        </div>
      </header>

      <div className="bg-bg-elev-2/50 min-w-0 rounded-lg border border-white/[0.06] px-3 py-2.5">
        <PluginOutput output={payload.proposedInput} />
      </div>

      {state === 'error' ? (
        <p role="alert" className="text-danger text-xs">
          {error ?? 'Confirmation failed.'}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          loading={state === 'confirming'}
          onClick={() => void confirm()}
        >
          <IconCheck className="size-4" aria-hidden="true" />
          Confirm
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={state === 'confirming'}
          onClick={() => setState('dismissed')}
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}
