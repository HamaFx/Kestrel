'use client';

// SPDX-License-Identifier: Apache-2.0

// Masked key input with copy/reveal affordances and the inline test feedback.
import type { ProviderMeta } from '@kestrel/shared';
import { IconCircleCheck, IconCircleX, IconCopy, IconEye, IconEyeOff } from '@tabler/icons-react';

import { Input } from '@/components/ui/input';

import type { TestState } from './api-key-badges';

interface ApiKeyInputProps {
  provider: ProviderMeta;
  value: string;
  revealed: boolean;
  isSet: boolean;
  dirty: boolean;
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
  dirty,
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
          placeholder={provider.keyHint}
          autoComplete="off"
          spellCheck={false}
          className="pr-24 font-mono"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
          {isSet && (
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
    </>
  );
}
