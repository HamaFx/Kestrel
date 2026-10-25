'use client';

// SPDX-License-Identifier: Apache-2.0

// Install affordance cards: the iOS Safari instructions and the Chrome/Edge
// one-click install prompt.
import { IconDownload, IconShare, IconX } from '@tabler/icons-react';

export function IosInstallHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="border-border bg-bg-elev-2 text-fg-muted text-caption mx-3 mt-2 flex items-start gap-3 rounded-sm border p-3">
      <IconShare className="text-fg-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p aria-live="polite" className="flex-1 leading-snug">
        Install Kestrel: tap <span className="text-fg font-medium">Share</span> then{' '}
        <span className="text-fg font-medium">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss install hint"
        className="text-fg-subtle hover:text-fg hover:bg-bg-elev-3 focus-visible:ring-fg -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <IconX className="size-4" />
      </button>
    </div>
  );
}

export function BrowserInstallPrompt({
  onInstall,
  onDismiss,
}: {
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="border-border bg-bg-elev-2 mx-3 mt-2 flex items-center gap-3 rounded-sm border p-3">
      <IconDownload className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
      <p aria-live="polite" className="text-fg-muted text-caption flex-1 leading-snug">
        Install Kestrel for one-tap access on your device.
      </p>
      <button
        type="button"
        onClick={() => void onInstall()}
        className="text-fg border-border hover:bg-bg-elev-3 text-caption focus-visible:ring-fg inline-flex min-h-[44px] items-center rounded-sm border px-4 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        Install
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss install hint"
        className="text-fg-subtle hover:text-fg hover:bg-bg-elev-3 focus-visible:ring-fg inline-flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <IconX className="size-4" />
      </button>
    </div>
  );
}
