'use client';

// SPDX-License-Identifier: Apache-2.0

// Masked key input with copy/reveal affordances and the inline test feedback.
//
// Audit 2026-10-31 (R5): the field is write-only for a stored key — it holds
// the KEEP sentinel until the user types a replacement, so no plaintext ever
// arrives from the server. Copy/reveal therefore only apply to a value the
// user has just typed in this session.
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
  /** The user has edited the field in this session. */
  dirty: boolean;
  canCopy: boolean;
  testState: TestState;
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
  onValueChange,
  onToggleReveal,
  onCopy,
}: ApiKeyInputProps) {
  return (
    <>
      {/* Input area */}
      <div className="relative">
        <Input
          id={`key-${provider.id}`}
          name={provider.id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
          }}
          placeholder={
            isPristineStoredKey
              ? 'Stored — type a new key to replace it, or clear the field to remove it'
              : provider.keyHint
          }
          autoComplete="off"
          spellCheck={false}
          className="pr-24 font-mono"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
          {canCopy && (
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
            className="text-fg-muted hover:text-fg inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors"
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
          Stored key is hidden. Leave the field untouched to keep it.
        </p>
      ) : null}
    </>
  );
}
