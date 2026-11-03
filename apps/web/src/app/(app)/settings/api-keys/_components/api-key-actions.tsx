'use client';

// SPDX-License-Identifier: Apache-2.0

// Action row for a BYOK card: explicit remove/undo plus the connection test.
// Kept separate so the card itself stays inside the React file-size gate.

import { IconLoader2, IconTrash } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

import type { TestState } from './api-key-badges';

interface ApiKeyActionsProps {
  isConfigured: boolean;
  isSet: boolean;
  pendingRemoval: boolean;
  testState: TestState;
  onTest: () => void;
  onRequestRemove: () => void;
  onUndoRemove: () => void;
}

export function ApiKeyActions({
  isConfigured,
  isSet,
  pendingRemoval,
  testState,
  onTest,
  onRequestRemove,
  onUndoRemove,
}: ApiKeyActionsProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {isConfigured && !pendingRemoval ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRequestRemove}>
            <IconTrash className="size-3.5" aria-hidden="true" />
            Remove key
          </Button>
        ) : null}
        {pendingRemoval ? (
          <Button type="button" variant="ghost" size="sm" onClick={onUndoRemove}>
            Undo removal
          </Button>
        ) : null}
        <span className="text-caption text-fg-subtle truncate">
          {pendingRemoval
            ? 'The stored key is deleted when you save.'
            : 'Encrypted at rest with AES-256-GCM. Press T to test.'}
        </span>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onTest}
        disabled={!isSet || testState.kind === 'pending' || pendingRemoval}
        loading={testState.kind === 'pending'}
      >
        {testState.kind === 'pending' ? (
          <>
            <IconLoader2 className="size-3 animate-spin" aria-hidden="true" />
            Testing…
          </>
        ) : (
          'Test connection'
        )}
      </Button>
    </div>
  );
}
