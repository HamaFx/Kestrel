'use client';

// SPDX-License-Identifier: Apache-2.0

// Masked secret input with a reveal toggle.
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';

import { Input } from '@/components/ui/input';

export function SecretInput({
  id,
  value,
  placeholder,
  disabled,
  error,
  describedBy,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string | undefined;
  disabled?: boolean;
  error?: boolean;
  describedBy?: string | undefined;
  onChange: (value: string) => void;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={reveal ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        error={error}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className="pr-12 font-mono"
      />
      <button
        type="button"
        onClick={() => setReveal((current) => !current)}
        disabled={disabled}
        aria-label={reveal ? 'Hide secret' : 'Reveal secret'}
        className="text-fg-subtle hover:text-fg absolute inset-y-0 right-0 flex w-11 items-center justify-center transition-colors"
      >
        {reveal ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
      </button>
    </div>
  );
}
