'use client';

// SPDX-License-Identifier: Apache-2.0

// Informational panels shown under the key input: rotation age warning and
// the last reported API rate limits.
import { IconAlertTriangle, IconClock } from '@tabler/icons-react';

import type { ApiKeyHealth } from './api-key-health';

type RateLimit = NonNullable<ApiKeyHealth['rateLimit']>;

interface KeyRotationWarningProps {
  keyAgeDays: number;
}

export function KeyRotationWarning({ keyAgeDays }: KeyRotationWarningProps) {
  if (keyAgeDays < 90) return null;
  return (
    <div className="border-warn/20 bg-warn/5 text-caption text-warn flex items-start gap-2.5 rounded-sm border p-3">
      <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <span className="text-fg font-semibold">Consider rotating your API key</span>
        <p className="text-fg-subtle text-xs">
          This key was last updated {keyAgeDays} days ago. Regular key rotation increases security.
        </p>
      </div>
    </div>
  );
}

export function RateLimitPanel({ rateLimit }: { rateLimit: RateLimit }) {
  return (
    <div className="border-border bg-bg-elev-2/40 text-caption text-fg-subtle flex flex-col gap-1.5 rounded-sm border p-3 shadow-sm">
      <div className="text-fg flex items-center gap-1.5 font-semibold">
        <IconClock className="size-3.5" />
        <span>API Rate Limits</span>
      </div>
      <div className="mt-0.5 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        {rateLimit.remainingRequests !== undefined && (
          <div className="flex flex-col gap-0.5">
            <span className="text-fg-muted font-medium">Requests Remaining</span>
            <span className="text-fg font-mono text-sm font-semibold tabular-nums">
              {rateLimit.remainingRequests}
            </span>
            {rateLimit.resetRequests && (
              <span className="text-xs opacity-60">Resets in {rateLimit.resetRequests}</span>
            )}
          </div>
        )}
        {rateLimit.remainingTokens !== undefined && (
          <div className="flex flex-col gap-0.5">
            <span className="text-fg-muted font-medium">Tokens Remaining</span>
            <span className="text-fg font-mono text-sm font-semibold tabular-nums">
              {rateLimit.remainingTokens.toLocaleString()}
            </span>
            {rateLimit.resetTokens && (
              <span className="text-xs opacity-60">Resets in {rateLimit.resetTokens}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
