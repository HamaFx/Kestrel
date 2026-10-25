'use client';

// SPDX-License-Identifier: Apache-2.0

// Export column of the backup & key migration panel: password entry,
// encrypted payload generation, and clipboard copy.
import { IconCheck, IconCopy, IconDownload, IconEye, IconEyeOff } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ExportKeysSection({
  exportPassword,
  setExportPassword,
  showExportPassword,
  setShowExportPassword,
  exportedPayload,
  copied,
  isExportPending,
  onExport,
  onCopy,
}: {
  exportPassword: string;
  setExportPassword: (value: string) => void;
  showExportPassword: boolean;
  setShowExportPassword: (value: boolean) => void;
  exportedPayload: string;
  copied: boolean;
  isExportPending: boolean;
  onExport: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconDownload className="text-fg size-4 shrink-0" />
        <h3 className="text-fg-muted text-xs font-bold tracking-wider uppercase">
          Export API Keys
        </h3>
      </div>
      <p className="text-fg-subtle text-xs leading-[1.4]">
        Encrypt your API keys using your account password. You will need the same password to
        decrypt and restore your keys later.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="export-pwd" className="text-fg-subtle text-xs font-bold uppercase">
          Account Password
        </label>
        <div className="relative">
          <Input
            id="export-pwd"
            type={showExportPassword ? 'text' : 'password'}
            placeholder="Your account password"
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
            className="text-xs"
          />
          <button
            type="button"
            onClick={() => setShowExportPassword(!showExportPassword)}
            className="text-fg-muted hover:text-fg absolute top-1/2 right-2 -translate-y-1/2"
            tabIndex={-1}
            aria-label={showExportPassword ? 'Hide password' : 'Show password'}
          >
            {showExportPassword ? (
              <IconEyeOff className="size-4" />
            ) : (
              <IconEye className="size-4" />
            )}
          </button>
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onExport}
        disabled={isExportPending || exportPassword.length < 8}
        loading={isExportPending}
        className="w-full self-start sm:w-auto"
      >
        {isExportPending ? 'Generating…' : 'Generate Backup Payload'}
      </Button>

      {exportedPayload && (
        <div className="mt-2 flex flex-col gap-1.5">
          <label
            htmlFor="export-payload"
            className="text-fg-subtle flex items-center justify-between text-xs font-bold uppercase"
          >
            <span>Backup Payload</span>
            <button
              type="button"
              onClick={onCopy}
              className="text-fg flex items-center gap-1 font-semibold normal-case hover:underline"
            >
              {copied ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </label>
          <textarea
            id="export-payload"
            readOnly
            value={exportedPayload}
            rows={4}
            className="border-border bg-bg-elev-2 text-fg w-full resize-none rounded-sm border p-2.5 font-mono text-xs focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
