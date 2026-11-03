'use client';

// SPDX-License-Identifier: Apache-2.0

// Per-provider BYOK card: status, masked preview, write-only input, test, and
// explicit remove. The stored secret never reaches this component.

import type { ProviderMeta } from '@kestrel/shared';
import { IconCircleCheck } from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { ProviderInfoDot } from '@/components/ui/provider-info-dot';
import { apiMutate } from '@/lib/http/api-client';

import { ApiKeyActions } from './api-key-actions';
import { StatusPill, UsageBadge, type TestState } from './api-key-badges';
import type { ApiKeyHealth } from './api-key-health';
import { ApiKeyInput } from './api-key-input';
import { KeyRotationWarning, RateLimitPanel } from './api-key-meta-panels';
import { BYOK_KEY_REMOVE } from './byok-key-sentinel';
import { ProviderLogo } from './provider-logo';
import { ProviderSetupDetails } from './provider-setup-details';

interface ApiKeyCardProps {
  provider: ProviderMeta;
  /** Whether a key is already stored for this provider. */
  isConfigured: boolean;
  /** Display-only mask of the stored key, e.g. `sk-p••••1a2b`. */
  maskedPreview?: string | undefined;
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
  isConfigured,
  maskedPreview,
  health,
  usage,
  keyUpdatedAt,
}: ApiKeyCardProps) {
  const [revealed, setRevealed] = useState(false);
  // Phase 1 (Task 1.1): the field starts empty. Empty means "keep whatever is
  // stored"; removal is an explicit action that submits BYOK_KEY_REMOVE.
  const [value, setValue] = useState('');
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [, startTransition] = useTransition();
  const [confirmNode, confirm] = useConfirm();

  const trimmed = value.trim();
  const pendingRemoval = value === BYOK_KEY_REMOVE;
  const typedValue = pendingRemoval ? '' : trimmed;
  const pristineStoredKey = isConfigured && value.length === 0;
  const dirty = value.length > 0 && !pendingRemoval;
  const isSet = !pendingRemoval && (isConfigured || typedValue.length > 0);

  let keyAgeDays: number | null = null;
  if (keyUpdatedAt && isSet) {
    const t = new Date(keyUpdatedAt).getTime();
    if (Number.isFinite(t)) {
      const diffMs = Date.now() - t;
      keyAgeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  function handleTest() {
    if (!isSet || pendingRemoval) return;
    setTest({ kind: 'pending' });
    startTransition(async () => {
      try {
        // A stored key has no plaintext to send; the route falls back to the
        // stored (server-side) value for that provider.
        const body =
          typedValue.length > 0
            ? { provider: provider.id, apiKey: typedValue }
            : { provider: provider.id };
        const data = await apiMutate<{ ok: boolean; error?: string }>(
          '/api/settings/test-provider',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
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

  async function handleRemove() {
    const ok = await confirm({
      title: `Remove ${provider.displayName} key?`,
      description:
        'The stored key is deleted when you save. Requests that rely on it will fail until you add a new key.',
      confirmLabel: 'Remove key',
      cancelLabel: 'Keep key',
      tone: 'danger',
    });
    if (ok) {
      setValue(BYOK_KEY_REMOVE);
      setTest({ kind: 'idle' });
    }
  }

  async function handleCopy() {
    if (typedValue.length === 0) return;
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
        await navigator.clipboard.writeText(typedValue);
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
        isPristineStoredKey={pristineStoredKey}
        dirty={dirty}
        canCopy={typedValue.length > 0}
        testState={test}
        maskedPreview={maskedPreview}
        pendingRemoval={pendingRemoval}
        onValueChange={(next) => {
          setValue(next);
          if (test.kind !== 'idle') setTest({ kind: 'idle' });
        }}
        onToggleReveal={() => setRevealed((r) => !r)}
        onCopy={handleCopy}
      />

      {/* Expandable setup instructions details. */}
      <ProviderSetupDetails provider={provider} />

      <ApiKeyActions
        isConfigured={isConfigured}
        isSet={isSet}
        pendingRemoval={pendingRemoval}
        testState={test}
        onTest={handleTest}
        onRequestRemove={handleRemove}
        onUndoRemove={() => setValue('')}
      />
      {confirmNode}
    </div>
  );
}
