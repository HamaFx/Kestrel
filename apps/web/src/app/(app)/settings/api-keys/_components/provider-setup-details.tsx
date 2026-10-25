'use client';

// SPDX-License-Identifier: Apache-2.0

// Expandable "Setup Instructions & Limits" details for a provider key.
import type { ProviderMeta } from '@kestrel/shared';

import { SETUP_INSTRUCTIONS } from './provider-setup-instructions';

export function ProviderSetupDetails({ provider }: { provider: ProviderMeta }) {
  const instructions = SETUP_INSTRUCTIONS[provider.id];
  if (!instructions) return null;

  return (
    <details className="border-divider bg-bg-elev-2/50 overflow-hidden rounded-sm border text-xs">
      <summary
        aria-label="Toggle setup instructions and limits"
        className="text-fg-subtle hover:text-fg flex cursor-pointer items-center justify-between px-3 py-1.5 font-medium transition-colors select-none"
      >
        <span>Setup Instructions & Limits</span>
        <span className="text-xs">▼</span>
      </summary>
      <div className="border-divider bg-bg-elev-2/10 flex flex-col gap-2 border-t p-3">
        <div>
          <span className="text-fg-muted font-semibold">How to get:</span>{' '}
          <span className="text-fg-subtle">{instructions.howToGet}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <div>
            <span className="text-fg-muted font-semibold">Free tier:</span>{' '}
            <span className="text-fg-subtle">{instructions.freeTier}</span>
          </div>
          <div>
            <span className="text-fg-muted font-semibold">Rate limits:</span>{' '}
            <span className="text-fg-subtle">{instructions.rateLimits}</span>
          </div>
        </div>
        <div className="mt-1">
          <a
            href={instructions.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg inline-flex items-center font-semibold hover:underline"
          >
            Go to {provider.displayName} Dashboard →
          </a>
        </div>
      </div>
    </details>
  );
}
