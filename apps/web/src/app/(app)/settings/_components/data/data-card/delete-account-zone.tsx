'use client';

// SPDX-License-Identifier: Apache-2.0

// Danger zone: permanently delete the account with password + optional 2FA.
import { IconEye, IconEyeOff, IconUserX } from '@tabler/icons-react';
import { signOut } from 'next-auth/react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { deleteAccountAction } from '@/app/(app)/settings/actions';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Input } from '@/components/ui/input';

export function DeleteAccountZone() {
  const [confirmEl, confirm] = useConfirm();
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteTotpCode, setDeleteTotpCode] = useState('');
  const [isDeletePending, startDeleteTransition] = useTransition();

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
    <>
      {/* Delete account Danger Zone */}
      <div className="surface-well border-danger/25 mt-2 flex flex-col gap-3 rounded-xl border p-4 shadow-inner">
        <div className="flex items-center gap-2">
          <IconUserX className="text-danger size-4" />
          <h3 className="text-danger font-mono text-xs font-bold tracking-wider uppercase">
            Danger Zone · Delete account
          </h3>
        </div>
        <p className="text-fg-subtle text-xs">
          Permanently purge your account, journal entries, conversations, alerts, and settings. This
          action is immediate and non-reversible.
        </p>
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="flex max-w-64 flex-1 flex-col gap-1">
            <label
              htmlFor="delete-pwd"
              className="text-caption text-fg-muted font-mono text-[11px]"
            >
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
            <label
              htmlFor="delete-totp"
              className="text-caption text-fg-muted font-mono text-[11px]"
            >
              2FA code (if active)
            </label>
            <Input
              id="delete-totp"
              type="text"
              placeholder="000000"
              maxLength={6}
              value={deleteTotpCode}
              onChange={(e) => setDeleteTotpCode(e.target.value.replace(/\D/g, ''))}
              className="font-mono text-xs"
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
    </>
  );
}
