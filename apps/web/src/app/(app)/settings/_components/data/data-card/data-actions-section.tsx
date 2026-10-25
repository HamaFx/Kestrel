'use client';

// SPDX-License-Identifier: Apache-2.0

// Data & cache actions: chat history, bookmarks, preferences, local wipe,
// and the GDPR data export button.
import {
  IconArrowBackUp,
  IconBookmark,
  IconDownload,
  IconMessage,
  IconTrash,
} from '@tabler/icons-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { clearChatHistoryAction, exportDataAction } from '@/app/(app)/settings/actions';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';

import { RowDivider } from '../../row-divider';
import { SettingsRow } from '../../settings-row';
import { KEY_BOOKMARKS, KEY_PREFS, useDataUsage } from './use-data-usage';

export function DataActionsSection() {
  const { counts, refresh } = useDataUsage();
  const [confirmEl, confirm] = useConfirm();
  const [isPending, startTransition] = useTransition();

  async function clearChatHistory() {
    const ok = await confirm({
      title: 'Clear chat history?',
      description:
        'This will permanently delete all conversations from the server. This action cannot be undone.',
      confirmLabel: 'Delete all',
      tone: 'danger',
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await clearChatHistoryAction();
      if (result.ok) {
        toast.success('Chat history cleared');
      } else {
        toast.error('Failed to clear chat history', { description: result.error });
      }
    });
  }

  async function clearBookmarks() {
    const ok = await confirm({
      title: 'Clear saved articles?',
      description: `${counts.bookmarks} bookmark${counts.bookmarks === 1 ? '' : 's'} will be removed from this device.`,
      confirmLabel: 'Clear',
      tone: 'danger',
    });
    if (!ok) return;
    window.localStorage.removeItem(KEY_BOOKMARKS);
    refresh();
    toast.success('Bookmarks cleared');
  }

  async function resetPrefs() {
    const ok = await confirm({
      title: 'Reset preferences?',
      description: 'Default symbol, time format, and motion settings will go back to defaults.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!ok) return;
    window.localStorage.removeItem(KEY_PREFS);
    refresh();
    toast.success('Preferences reset', {
      description: 'Reload the page to apply.',
    });
  }

  async function clearAll() {
    const ok = await confirm({
      title: 'Clear all local data?',
      description:
        'Removes bookmarks, preferences, and any other locally cached state. Server-side data (alerts, journal) is untouched.',
      confirmLabel: 'Clear everything',
      tone: 'danger',
    });
    if (!ok) return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('kestrel:')) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
    refresh();
    window.dispatchEvent(new CustomEvent('kestrel:storage-cleared'));
    toast.success('All local data cleared');
  }

  return (
    <>
      <SettingsRow
        icon={<IconMessage className="size-4" />}
        label="Chat history"
        description="Permanently delete all server-side conversations"
        action={
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => void clearChatHistory()}
            disabled={isPending}
            className="tactile-press"
          >
            <IconTrash className="size-3.5" />
            Delete all
          </Button>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<IconBookmark className="size-4" />}
        label="Saved articles"
        description={`${counts.bookmarks} bookmark${counts.bookmarks === 1 ? '' : 's'} stored`}
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void clearBookmarks()}
            disabled={counts.bookmarks === 0}
            className="tactile-press"
          >
            <IconTrash className="size-3.5" />
            Clear
          </Button>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<IconArrowBackUp className="size-4" />}
        label="Reset preferences"
        description="Clear local theme + default symbol overrides"
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void resetPrefs()}
            className="tactile-press"
          >
            Reset
          </Button>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<IconTrash className="size-4" />}
        label="Clear all local data"
        description={`${counts.storage} key${counts.storage === 1 ? '' : 's'} on this device`}
        action={
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => void clearAll()}
            disabled={counts.storage === 0}
            className="tactile-press"
          >
            <IconTrash className="size-3.5" />
            Clear all
          </Button>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<IconDownload className="size-4" />}
        label="Export my data"
        description="Download all your data as JSON (GDPR)"
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="tactile-press"
            onClick={async () => {
              const pwd = window.prompt('Enter your account password to export data:');
              if (!pwd) {
                toast.error('Password is required to export your data');
                return;
              }
              const result = await exportDataAction(pwd);
              if (result.ok && result.data) {
                const blob = new Blob([result.data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `kestrel-export-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Data export ready');
              } else {
                toast.error(
                  'error' in result ? (result.error ?? 'Export failed') : 'Export failed',
                );
              }
            }}
          >
            <IconDownload className="size-3.5" />
            Export
          </Button>
        }
      />

      {confirmEl}
    </>
  );
}
