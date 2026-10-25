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
import type { ProviderMeta } from '@kestrel/shared';
import { IconCircleCheck, IconLoader2 } from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { ProviderInfoDot } from '@/components/ui/provider-info-dot';
import { apiMutate } from '@/lib/http/api-client';

import { StatusPill, UsageBadge, type TestState } from './api-key-badges';
import type { ApiKeyHealth } from './api-key-health';
import { ApiKeyInput } from './api-key-input';
import { KeyRotationWarning, RateLimitPanel } from './api-key-meta-panels';
import { ProviderLogo } from './provider-logo';
import { ProviderSetupDetails } from './provider-setup-details';

interface ApiKeyCardProps {
  provider: ProviderMeta;
  currentValue: string;
  keyUpdatedAt?: string | undefined;
  health?: ApiKeyHealth | undefined;
  usage?:
    | {
        turns: number;
        costUsd: number;
      }
    | undefined;
}

export function ApiKeyCard({
  provider,
  currentValue,
  health,
  usage,
  keyUpdatedAt,
}: ApiKeyCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [, startTransition] = useTransition();
  const [confirmNode, confirm] = useConfirm();

  const dirty = value.trim() !== currentValue;
  const isSet = value.trim().length > 0;

  let keyAgeDays: number | null = null;
  if (keyUpdatedAt && isSet) {
    const t = new Date(keyUpdatedAt).getTime();
    if (Number.isFinite(t)) {
      const diffMs = Date.now() - t;
      keyAgeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  function handleTest() {
    if (!isSet) return;
    setTest({ kind: 'pending' });
    startTransition(async () => {
      try {
        const data = await apiMutate<{ ok: boolean; error?: string }>(
          '/api/settings/test-provider',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: provider.id, apiKey: value.trim() }),
          },
        );
        if (!data.ok) {
          setTest({ kind: 'err', message: data.error ?? 'Provider test failed' });
        } else {
          setTest({ kind: 'ok' });
        }
      } catch (err) {
        setTest({
          kind: 'err',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  async function handleCopy() {
    if (!isSet) return;
    const ok = await confirm({
      title: 'Copy API Key to Clipboard?',
      description:
        'API keys are highly sensitive. Storing them in the system clipboard makes them accessible to other applications running on your device. Proceed with caution.',
      confirmLabel: 'Copy Key',
      cancelLabel: 'Cancel',
      tone: 'default',
    });
    if (ok) {
      try {
        await navigator.clipboard.writeText(value.trim());
        toast.success('API Key copied to clipboard');
      } catch {
        toast.error('Failed to copy to clipboard');
      }
    }
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 't' || e.key === 'T') {
          if (
            document.activeElement?.tagName === 'INPUT' ||
            document.activeElement?.tagName === 'TEXTAREA'
          ) {
            return;
          }
          e.preventDefault();
          handleTest();
        }
      }}
      className="border-border bg-bg-elev-1 focus:ring-border flex flex-col gap-3 rounded-sm border p-4 focus:ring-2 focus:outline-none"
    >
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <ProviderLogo id={provider.id} />
            <label htmlFor={`key-${provider.id}`} className="text-fg text-sm font-medium">
              {provider.displayName}
            </label>
            {provider.pricingTier === 'free' && (
              <span className="bg-success/15 text-success rounded-sm px-2 py-0.5 text-xs font-semibold">
                Free
              </span>
            )}
            <StatusPill isSet={isSet} health={health} testState={test} />
            <ProviderInfoDot provider={provider} side="top" />
            <UsageBadge usage={usage} />
          </div>
          <p className="text-fg-subtle text-xs">{provider.description}</p>
        </div>
        {isSet && test.kind !== 'pending' ? (
          <span
            className={
              test.kind === 'ok'
                ? 'text-success flex shrink-0 items-center gap-1 text-xs'
                : 'text-fg-subtle flex shrink-0 items-center gap-1 text-xs'
            }
          >
            {test.kind === 'ok' && <IconCircleCheck className="size-3" />}
            {test.kind === 'ok'
              ? 'Looks valid'
              : test.kind === 'err'
                ? 'Last test failed'
                : 'Saved'}
          </span>
        ) : null}
      </div>

      {keyAgeDays !== null ? <KeyRotationWarning keyAgeDays={keyAgeDays} /> : null}

      {health?.rateLimit ? <RateLimitPanel rateLimit={health.rateLimit} /> : null}

      <ApiKeyInput
        provider={provider}
        value={value}
        revealed={revealed}
        isSet={isSet}
        dirty={dirty}
        testState={test}
        onValueChange={(next) => {
          setValue(next);
          if (test.kind !== 'idle') setTest({ kind: 'idle' });
        }}
        onToggleReveal={() => setRevealed((r) => !r)}
        onCopy={handleCopy}
      />

      {/* Expandable setup instructions details. */}
      <ProviderSetupDetails provider={provider} />

      {/* Action row: test button. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-fg-subtle">
          Key is encrypted at rest with AES-256-GCM. Press{' '}
          <kbd className="bg-bg-elev-2 border-border rounded-sm border px-1.5 py-0.5 text-xs">
            T
          </kbd>{' '}
          to test.
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleTest}
          disabled={!isSet || test.kind === 'pending'}
          loading={test.kind === 'pending'}
        >
          {test.kind === 'pending' ? (
            <>
              <IconLoader2 className="size-3 animate-spin" />
              Testing…
            </>
          ) : (
            'Test connection'
          )}
        </Button>
      </div>
      {confirmNode}
    </div>
  );
}
