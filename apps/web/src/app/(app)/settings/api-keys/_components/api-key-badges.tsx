'use client';

// SPDX-License-Identifier: Apache-2.0

// Small status chips shown in the API-key card header.
import { formatRelative } from '@/lib/formatters/format';

export type TestState =
  { kind: 'idle' } | { kind: 'pending' } | { kind: 'ok' } | { kind: 'err'; message: string };

/**
 * StatusPill — single small chip on the right of the provider name
 * summarising: set / not set / last-tested-failed. The bulk-test
 * response updates this via revalidatePath.
 */
export function StatusPill({
  isSet,
  health,
  testState,
}: {
  isSet: boolean;
  health?: { ok: boolean; error: string | null; testedAt: string } | undefined;
  testState: TestState;
}) {
  if (!isSet) {
    return (
      <span className="bg-bg-elev-2 text-caption text-fg-subtle rounded-sm px-2 py-0.5 font-medium">
        Not set
      </span>
    );
  }
  // Live test result takes precedence over the cached health snapshot.
  if (testState.kind === 'err') {
    return (
      <span className="bg-danger/15 text-caption text-danger rounded-sm px-2 py-0.5 font-medium">
        Failed
      </span>
    );
  }
  if (testState.kind === 'ok') {
    return (
      <span className="bg-success/15 text-caption text-success rounded-sm px-2 py-0.5 font-medium">
        OK
      </span>
    );
  }
  if (!health) {
    return (
      <span className="bg-bg-elev-2 text-caption text-fg-subtle rounded-sm px-2 py-0.5 font-medium">
        Saved (untested)
      </span>
    );
  }
  if (!health.ok) {
    return (
      <span className="bg-danger/15 text-caption text-danger rounded-sm px-2 py-0.5 font-medium">
        Failed <span className="opacity-60">·</span> {formatRelative(health.testedAt)}
      </span>
    );
  }
  return (
    <span className="bg-success/15 text-caption text-success rounded-sm px-2 py-0.5 font-medium">
      OK <span className="opacity-60">·</span> {formatRelative(health.testedAt)}
    </span>
  );
}

/**
 * UsageBadge — shows the 30-day cost + turn count for this provider
 * when usage is non-zero. Hidden when there's no usage so the card
 * header stays clean for fresh setups.
 */
export function UsageBadge({ usage }: { usage?: { turns: number; costUsd: number } | undefined }) {
  if (!usage || usage.turns === 0) return null;
  return (
    <span className="bg-bg-elev-2 text-caption text-fg rounded-sm px-2 py-0.5 font-medium tabular-nums">
      {usage.turns} {usage.turns === 1 ? 'turn' : 'turns'} · ${usage.costUsd.toFixed(2)}
    </span>
  );
}
