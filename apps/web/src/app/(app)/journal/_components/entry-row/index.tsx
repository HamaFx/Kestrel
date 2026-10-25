'use client';

/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Journal entry row shell: composes the summary column, outcome/action panel,
// live SL-to-TP slider, manual close form, and the setup-replay drawer.
import type { JournalEntry } from '@kestrel/shared';

import type { useConfirm } from '@/components/ui/confirm-drawer';
import { cn } from '@/lib/formatters/cn';

import { SetupReplayModal } from '../setup-replay-modal';
import { CloseEntryForm } from './close-entry-form';
import { EntryActions } from './entry-actions';
import { EntrySliderBar } from './entry-slider-bar';
import { EntrySummary } from './entry-summary';
import { OutcomeSummary } from './outcome-summary';
import { useEntryMetrics } from './use-entry-metrics';
import { useEntryRowState } from './use-entry-row-state';

type ConfirmFn = ReturnType<typeof useConfirm>[1];

interface EntryRowProps {
  entry: JournalEntry;
  openedAtLabel: string;
  closedAtLabel?: string;
  livePrice?: number | undefined;
  onClosed: () => void;
  onDeleted: () => void;
  confirm: ConfirmFn;
}

export function EntryRow({
  entry,
  openedAtLabel,
  closedAtLabel,
  livePrice,
  onClosed,
  onDeleted,
  confirm,
}: EntryRowProps) {
  const {
    closing,
    setClosing,
    replayOpen,
    setReplayOpen,
    exit,
    setExit,
    busy,
    error,
    close,
    remove,
    cancelClose,
  } = useEntryRowState({ entry, onClosed, onDeleted, confirm });

  const { liveStats, sliderPosition, isWin, isLoss, outcomeColor } = useEntryMetrics(
    entry,
    livePrice,
  );

  return (
    <li
      className={cn(
        'surface-panel flex flex-col gap-3.5 rounded-xl border border-white/10 p-4 shadow-[var(--shadow-chip)] backdrop-blur-md transition-all duration-200 hover:border-white/20',
        isWin
          ? 'border-l-bull/80 border-l-2'
          : isLoss
            ? 'border-l-bear/80 border-l-2'
            : 'border-l-2 border-l-white/20',
      )}
    >
      <div className="flex items-start gap-4">
        <EntrySummary entry={entry} openedAtLabel={openedAtLabel} closedAtLabel={closedAtLabel} />

        {/* Action Panel / Metrics on Right Side */}
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <OutcomeSummary entry={entry} liveStats={liveStats} outcomeColor={outcomeColor} />
          <EntryActions
            entry={entry}
            closing={closing}
            busy={busy}
            onStartClose={() => setClosing(true)}
            onReplay={() => setReplayOpen(true)}
            onDelete={() => void remove()}
          />
        </div>
      </div>

      <EntrySliderBar
        entry={entry}
        livePrice={livePrice}
        sliderPosition={sliderPosition}
        isWin={isWin}
        isLoss={isLoss}
        outcomeColor={outcomeColor}
      />

      {closing && (
        <CloseEntryForm
          entryId={entry.id}
          exit={exit}
          error={error}
          busy={busy}
          onExitChange={setExit}
          onSave={close}
          onCancel={cancelClose}
        />
      )}

      {/* Setup Replay Modal */}
      <SetupReplayModal entry={entry} open={replayOpen} onOpenChange={setReplayOpen} />
    </li>
  );
}
