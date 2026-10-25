'use client';

// SPDX-License-Identifier: Apache-2.0

// Entry/stop/target/size price inputs with inline field validation.
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface PriceFieldsProps {
  entry: string;
  stop: string;
  target: string;
  size: string;
  fieldErrors: Record<string, string | null>;
  onEntryChange: (value: string) => void;
  onEntryBlur: () => void;
  onStopChange: (value: string) => void;
  onStopBlur: () => void;
  onTargetChange: (value: string) => void;
  onTargetBlur: () => void;
  onSizeChange: (value: string) => void;
}

export function PriceFields({
  entry,
  stop,
  target,
  size,
  fieldErrors,
  onEntryChange,
  onEntryBlur,
  onStopChange,
  onStopBlur,
  onTargetChange,
  onTargetBlur,
  onSizeChange,
}: PriceFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Entry" htmlFor="entry" required error={fieldErrors.entry ?? null}>
        <Input
          id="entry"
          value={entry}
          onChange={(e) => onEntryChange(e.target.value)}
          onBlur={onEntryBlur}
          inputMode="decimal"
          error={!!fieldErrors.entry}
        />
      </Field>
      <Field label="Stop (optional)" htmlFor="stop" error={fieldErrors.stop ?? null}>
        <Input
          id="stop"
          value={stop}
          onChange={(e) => onStopChange(e.target.value)}
          onBlur={onStopBlur}
          inputMode="decimal"
          error={!!fieldErrors.stop}
        />
      </Field>
      <Field label="Target (optional)" htmlFor="target" error={fieldErrors.target ?? null}>
        <Input
          id="target"
          value={target}
          onChange={(e) => onTargetChange(e.target.value)}
          onBlur={onTargetBlur}
          inputMode="decimal"
          error={!!fieldErrors.target}
        />
      </Field>
      <Field label="Size in lots (optional)" htmlFor="size">
        <Input
          id="size"
          value={size}
          onChange={(e) => onSizeChange(e.target.value)}
          inputMode="decimal"
        />
      </Field>
    </div>
  );
}
