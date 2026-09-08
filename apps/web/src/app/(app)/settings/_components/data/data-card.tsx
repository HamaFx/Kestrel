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

// Data & cache card — local-storage management. The personal app keeps
// bookmarks and prefs in localStorage; this card lets the user clear
// individual keys or wipe everything stored on this device.
import {
  IconArrowBackUp,
  IconBookmark,
  IconDatabase,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconMessage,
  IconTrash,
  IconUserX,
} from '@tabler/icons-react';
import { signOut } from 'next-auth/react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Input } from '@/components/ui/input';
import { migrateLegacyStorageNamespace } from '@/lib/storage';

import { clearChatHistoryAction, deleteAccountAction, exportDataAction } from '../../actions';
import { RowDivider } from '../row-divider';
import { SettingsRow } from '../settings-row';

const KEY_BOOKMARKS = 'kestrel:news:bookmarks';
const KEY_PREFS = 'kestrel:prefs:v1';

interface Counts {
  bookmarks: number;
  storage: number;
}

function readCounts(): Counts {
  if (typeof window === 'undefined') return { bookmarks: 0, storage: 0 };
  migrateLegacyStorageNamespace();
  let bookmarks = 0;
  let storage = 0;
  try {
    const raw = window.localStorage.getItem(KEY_BOOKMARKS);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) bookmarks = parsed.length;
    }
  } catch {
    console.error('[settings] failed to parse bookmarks from localStorage');
  }
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith('kestrel:')) storage += 1;
  }
  return { bookmarks, storage };
}

export function DataCard() {
  const [counts, setCounts] = useState<Counts>({ bookmarks: 0, storage: 0 });
  const [confirmEl, confirm] = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteTotpCode, setDeleteTotpCode] = useState('');
  const [isDeletePending, startDeleteTransition] = useTransition();

  useEffect(() => {
    setCounts(readCounts());
    function onStorage(e: StorageEvent) {
      if (!e.key || e.key.startsWith('kestrel:')) setCounts(readCounts());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
    setCounts(readCounts());
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
    setCounts(readCounts());
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
    setCounts(readCounts());
    window.dispatchEvent(new CustomEvent('kestrel:storage-cleared'));
    toast.success('All local data cleared');
  }

  async function handleDeleteAccount() {
    const ok = await confirm({
      title: 'Delete account permanently?',
      description:
        'This will immediately delete your account, all conversations, journal entries, alerts, and settings. This action cannot be undone.',
      confirmLabel: 'Delete my account',
      tone: 'danger',
    });
    if (!ok) return;

    startDeleteTransition(async () => {
      const result = await deleteAccountAction(deletePassword, deleteTotpCode || undefined);
      if (result.ok) {
        await signOut({ callbackUrl: '/' });
      } else {
        toast.error(result.error || 'Failed to delete account');
      }
    });
  }

  return (
    <section
      aria-labelledby="data-heading"
      className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5 shadow-[var(--shadow-chip)]"
    >
      <header className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-cyan-400">
            <IconDatabase className="size-4" />
          </div>
          <div>
            <h2 id="data-heading" className="text-fg text-sm font-semibold tracking-tight">
              Storage & Cache Management
            </h2>
            <p className="text-fg-subtle text-xs">
              Local data retention, thread history, and privacy exports
            </p>
          </div>
        </div>
        <span className="surface-chip text-fg-subtle rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase">
          Client & Server
        </span>
      </header>

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

      {/* Delete account Danger Zone */}
      <div className="surface-well mt-2 flex flex-col gap-3 rounded-xl border border-danger/25 p-4 shadow-inner">
        <div className="flex items-center gap-2">
          <IconUserX className="text-danger size-4" />
          <h3 className="text-danger font-mono text-xs font-bold tracking-wider uppercase">
            Danger Zone · Delete account
          </h3>
        </div>
        <p className="text-fg-subtle text-xs">
          Permanently purge your account, journal entries, conversations, alerts, and settings. This action is immediate and non-reversible.
        </p>
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="flex max-w-64 flex-1 flex-col gap-1">
            <label htmlFor="delete-pwd" className="text-caption text-fg-muted font-mono text-[11px]">
              Account password
            </label>
            <div className="relative">
              <Input
                id="delete-pwd"
                type={showDeletePassword ? 'text' : 'password'}
                placeholder="Enter account password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="text-xs"
              />
              <button
                type="button"
                onClick={() => setShowDeletePassword(!showDeletePassword)}
                className="text-fg-muted hover:text-fg absolute top-1/2 right-2 -translate-y-1/2"
                tabIndex={-1}
                aria-label={showDeletePassword ? 'Hide password' : 'Show password'}
              >
                {showDeletePassword ? (
                  <IconEyeOff className="size-3.5" />
                ) : (
                  <IconEye className="size-3.5" />
                )}
              </button>
            </div>
          </div>
          <div className="flex w-32 flex-col gap-1">
            <label htmlFor="delete-totp" className="text-caption text-fg-muted font-mono text-[11px]">
              2FA code (if active)
            </label>
            <Input
              id="delete-totp"
              type="text"
              placeholder="000000"
              maxLength={6}
              value={deleteTotpCode}
              onChange={(e) => setDeleteTotpCode(e.target.value.replace(/\D/g, ''))}
              className="text-xs font-mono"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={!deletePassword || isDeletePending}
            loading={isDeletePending}
            onClick={() => void handleDeleteAccount()}
            className="tactile-press"
          >
            Delete account
          </Button>
        </div>
      </div>

      {confirmEl}
    </section>

  );
}
