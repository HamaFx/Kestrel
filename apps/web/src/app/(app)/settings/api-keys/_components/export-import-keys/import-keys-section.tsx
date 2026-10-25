'use client';

// SPDX-License-Identifier: Apache-2.0

// Import column of the backup & key migration panel: paste a payload,
// enter the decryption password, and restore the keys.
import { IconEye, IconEyeOff, IconUpload } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ImportKeysSection({
  importPayload,
  setImportPayload,
  importPassword,
  setImportPassword,
  showImportPassword,
  setShowImportPassword,
  isImportPending,
  onImport,
}: {
  importPayload: string;
  setImportPayload: (value: string) => void;
  importPassword: string;
  setImportPassword: (value: string) => void;
  showImportPassword: boolean;
  setShowImportPassword: (value: boolean) => void;
  isImportPending: boolean;
  onImport: () => void;
}) {
  return (
    <div className="border-border flex flex-col gap-4 border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-6">
      <div className="flex items-center gap-2">
        <IconUpload className="text-fg size-4 shrink-0" />
        <h3 className="text-fg-muted text-xs font-bold tracking-wider uppercase">
          Import API Keys
        </h3>
      </div>
      <p className="text-fg-subtle text-xs leading-[1.4]">
        Paste a previously exported backup payload and enter your account password to restore your
        keys.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="import-payload" className="text-fg-subtle text-xs font-bold uppercase">
            Backup Payload
          </label>
          <textarea
            id="import-payload"
            placeholder="Paste backup payload here..."
            value={importPayload}
            onChange={(e) => setImportPayload(e.target.value)}
            rows={3}
            className="border-border bg-bg-elev-2 text-fg focus:border-border focus:ring-border w-full resize-none rounded-sm border p-2.5 font-mono text-xs focus:ring-1 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="import-pwd" className="text-fg-subtle text-xs font-bold uppercase">
            Decryption Password
          </label>
          <div className="relative">
            <Input
              id="import-pwd"
              type={showImportPassword ? 'text' : 'password'}
              placeholder="Enter backup password"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              className="text-xs"
            />
            <button
              type="button"
              onClick={() => setShowImportPassword(!showImportPassword)}
              className="text-fg-muted hover:text-fg absolute top-1/2 right-2 -translate-y-1/2"
              tabIndex={-1}
              aria-label={showImportPassword ? 'Hide password' : 'Show password'}
            >
              {showImportPassword ? (
                <IconEyeOff className="size-4" />
              ) : (
                <IconEye className="size-4" />
              )}
            </button>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={onImport}
          disabled={isImportPending || !importPayload || !importPassword}
          loading={isImportPending}
          className="mt-1 w-full self-start sm:w-auto"
        >
          {isImportPending ? 'Importing…' : 'Decrypt & Restore Keys'}
        </Button>
      </div>
    </div>
  );
}
