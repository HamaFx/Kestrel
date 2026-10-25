'use client';

// SPDX-License-Identifier: Apache-2.0

// Screenshot attachment field for the entry form: picker, upload state, and
// thumbnail preview with a remove control.
import { IconCamera, IconX } from '@tabler/icons-react';
import Image from 'next/image';
import type { ChangeEvent } from 'react';

import { cn } from '@/lib/formatters/cn';

interface ScreenshotFieldProps {
  screenshotUrl: string | null;
  uploading: boolean;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

export function ScreenshotField({
  screenshotUrl,
  uploading,
  onPick,
  onRemove,
}: ScreenshotFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-fg-subtle text-body-sm tracking-wide uppercase">
        Chart Screenshot
      </label>
      {screenshotUrl ? (
        <div className="relative inline-block">
          <Image
            src={screenshotUrl}
            alt="Trade chart"
            width={80}
            height={80}
            className="border-border h-20 rounded-sm border object-cover"
            unoptimized
          />
          <button
            type="button"
            onClick={onRemove}
            className="bg-bg-elev-3 border-border text-fg-muted hover:text-fg absolute -top-2 -right-2 rounded-sm border p-0.5"
            aria-label="Remove screenshot"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      ) : (
        <label
          className={cn(
            'border-border text-fg-subtle hover:border-border hover:text-fg flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed p-3 text-xs transition-colors',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          <IconCamera className="size-4" />
          {uploading ? 'Uploading…' : 'Add screenshot'}
          <input
            type="file"
            accept="image/*"
            onChange={onPick}
            className="sr-only"
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
