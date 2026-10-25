'use client';

// SPDX-License-Identifier: Apache-2.0

// Roving-keyboard-navigable model row for the regenerate model picker.
import { IconCircleCheck } from '@tabler/icons-react';

export function RegenRow({
  label,
  fullyQualified,
  isActive,
  onClick,
}: {
  label: string;
  fullyQualified: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-model-id={fullyQualified}
      onClick={onClick}
      className="text-fg hover:bg-bg-elev-2 focus:bg-bg-elev-2 flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left text-xs transition-colors focus:outline-none"
    >
      <span className="truncate">{label}</span>
      {isActive ? (
        <IconCircleCheck size={14} className="text-success shrink-0" aria-hidden="true" />
      ) : null}
    </button>
  );
}
