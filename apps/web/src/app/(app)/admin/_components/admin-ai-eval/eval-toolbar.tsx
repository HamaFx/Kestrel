'use client';

// SPDX-License-Identifier: Apache-2.0

// Start/stop/reset toolbar and the run summary line for the AI eval sweep.
import { IconLoader2, IconPlayerPlay, IconSquare } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { AI_EVAL_PROMPTS } from '@/lib/services/ai-eval-prompts';

interface EvalToolbarProps {
  running: boolean;
  summary: string | null;
  completed: number;
  onRun: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function EvalToolbar({
  running,
  summary,
  completed,
  onRun,
  onStop,
  onReset,
}: EvalToolbarProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={onRun}
          disabled={running}
          variant={running ? 'secondary' : 'primary'}
          size="sm"
        >
          {running ? (
            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <IconPlayerPlay className="size-4" aria-hidden="true" />
          )}
          {running ? `Running… ${completed}/${AI_EVAL_PROMPTS.length}` : 'Start eval run'}
        </Button>
        {running ? (
          <Button type="button" onClick={onStop} variant="secondary" size="sm">
            <IconSquare className="size-4" aria-hidden="true" /> Stop
          </Button>
        ) : null}
        {!running && completed > 0 ? (
          <Button type="button" onClick={onReset} variant="ghost" size="sm">
            Reset
          </Button>
        ) : null}
      </div>

      {summary ? (
        <p role="status" className="text-fg-muted mt-3 text-sm">
          {summary}
        </p>
      ) : null}
    </>
  );
}
