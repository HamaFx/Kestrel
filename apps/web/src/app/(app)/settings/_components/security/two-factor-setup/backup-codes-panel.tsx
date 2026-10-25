'use client';

// SPDX-License-Identifier: Apache-2.0

// Backup codes panel: single-use recovery codes with a copy-all button.
// Rendered after setup and in the enabled/done stages.
import { IconCopy } from '@tabler/icons-react';

export function BackupCodesPanel({
  codes,
  onCopy,
  copyButtonClassName,
}: {
  codes: string[];
  onCopy: () => void;
  copyButtonClassName: string;
}) {
  return (
    <div className="surface-well flex w-full flex-col gap-2 rounded-xl border border-white/5 p-4 shadow-inner">
      <div className="flex items-center justify-between">
        <span className="text-fg text-sm font-semibold">Backup Codes</span>
        <button
          type="button"
          onClick={onCopy}
          className={copyButtonClassName}
          aria-label="Copy all backup codes"
        >
          <IconCopy className="size-3.5" />
        </button>
      </div>
      <p className="text-caption text-fg-subtle">
        Save these single-use codes in a safe place. They are only shown once.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {codes.map((code) => (
          <code
            key={code}
            className="surface-chip rounded-lg border border-white/5 px-2 py-1 text-center font-mono text-xs select-all"
          >
            {code}
          </code>
        ))}
      </div>
    </div>
  );
}
