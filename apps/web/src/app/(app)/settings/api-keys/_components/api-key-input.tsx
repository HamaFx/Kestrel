'use client';

// SPDX-License-Identifier: Apache-2.0

// Masked key input with copy/reveal affordances and inline test feedback.
//
// Phase 1 (Task 1.1): the field is empty for a stored key and shows a
// server-built mask in the placeholder. It never contains plaintext that came
// from the server, so copy/reveal only apply to a value typed this session.

import type { ProviderMeta } from '@kestrel/shared';
import { IconCircleCheck, IconCircleX, IconCopy, IconEye, IconEyeOff } from '@tabler/icons-react';

import { Input } from '@/components/ui/input';

import type { TestState } from './api-key-badges';

interface ApiKeyInputProps {
  provider: ProviderMeta;
  value: string;
  revealed: boolean;
  /** A key is currently stored server-side (or one has just been typed). */
  isSet: boolean;
  /** A stored key exists and the field has not been edited yet. */
  isPristineStoredKey: boolean;
  /** The user has typed a replacement value in this session. */
  dirty: boolean;
  canCopy: boolean;
  testState: TestState;
  /** Masked preview of the stored key, e.g. `sk-p••••1a2b`. */
  maskedPreview?: string | undefined;
  /** The explicit Remove action has been queued for the next save. */
  pendingRemoval: boolean;
  onValueChange: (value: string) => void;
  onToggleReveal: () => void;
  onCopy: () => void;
}

export function ApiKeyInput({
  provider,
  value,
  revealed,
  isSet,
  isPristineStoredKey,
  dirty,
  canCopy,
  testState,
  maskedPreview,
  pendingRemoval,
  onValueChange,
  onToggleReveal,
  onCopy,
}: ApiKeyInputProps) {
  let placeholder = provider.keyHint;
  if (pendingRemoval) {
    placeholder = 'Key will be removed when you save';
  } else if (isPristineStoredKey && maskedPreview) {
    placeholder = `Stored: ${maskedPreview}. Type a new key to replace it.`;
  } else if (isPristineStoredKey) {
    placeholder = 'Stored key. Leave empty to keep it, or type a new key.';
  }

  return (
    <>
      {/* Input area */}
      <div className="relative">
        <Input
          id={`key-${provider.id}`}
          name={provider.id}
          type={revealed ? 'text' : 'password'}
          value={pendingRemoval ? '' : value}
          onChange={(e) => {
            onValueChange(e.target.value);
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          disabled={pendingRemoval}
          className="pr-24 font-mono"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
          {canCopy && !pendingRemoval && (
            <button
              type="button"
              onClick={onCopy}
              className="text-fg-muted hover:text-fg inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors"
              aria-label="Copy key to clipboard"
            >
              <IconCopy className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleReveal}
            disabled={pendingRemoval}
            className="text-fg-muted hover:text-fg inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors disabled:opacity-40"
            aria-label={revealed ? 'Hide key' : 'Show key'}
          >
            {revealed ? <IconEyeOff className="size-3.5" /> : <IconEye className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Validation / test feedback. */}
      {testState.kind === 'err' ? (
        <div className="text-danger flex items-start gap-2 text-xs">
          <IconCircleX className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words">{testState.message}</span>
        </div>
      ) : null}
      {testState.kind === 'ok' && dirty ? (
        <div className="text-success flex items-center gap-2 text-xs">
          <IconCircleCheck className="size-3.5 shrink-0" />
          <span>New value passes validation. Click Save to apply.</span>
        </div>
      ) : null}
      {isSet && isPristineStoredKey ? (
        <p className="text-caption text-fg-subtle">
          The stored key is hidden. Leave the field empty to keep it.
        </p>
      ) : null}
    </>
  );
}
