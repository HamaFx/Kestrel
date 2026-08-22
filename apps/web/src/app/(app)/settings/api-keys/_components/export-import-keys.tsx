// SPDX-License-Identifier: Apache-2.0

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
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconUpload,
} from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { exportKeysAction, importKeysAction } from '../../actions';

export function ExportImportKeys() {
  const [exportPassword, setExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exportedPayload, setExportedPayload] = useState('');
  const [copied, setCopied] = useState(false);
  const [isExportPending, startExportTransition] = useTransition();

  const [importPayload, setImportPayload] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [isImportPending, startImportTransition] = useTransition();

  async function handleExport() {
    if (exportPassword.length < 8) {
      toast.error('Export password must be at least 8 characters long');
      return;
    }

    startExportTransition(async () => {
      const res = await exportKeysAction(exportPassword);
      if (res.ok && res.data?.payload) {
        setExportedPayload(res.data.payload);
        toast.success('Backup payload generated successfully');
      } else {
        toast.error(
          'error' in res
            ? (res.error ?? 'Failed to generate backup payload')
            : 'Failed to generate backup payload',
        );
      }
    });
  }

  async function handleCopy() {
    if (!exportedPayload) return;
    try {
      await navigator.clipboard.writeText(exportedPayload);
      setCopied(true);
      toast.success('Backup payload copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  async function handleImport() {
    if (!importPayload.trim()) {
      toast.error('Please enter the backup payload');
      return;
    }
    if (!importPassword) {
      toast.error('Please enter the decryption password');
      return;
    }

    startImportTransition(async () => {
      const res = await importKeysAction(importPayload.trim(), importPassword);
      if (res.ok) {
        toast.success(`Successfully imported ${res.data?.importedCount} keys!`);
        setImportPayload('');
        setImportPassword('');
      } else {
        toast.error(res.error || 'Failed to import keys');
      }
    });
  }

  return (
    <details className="border-border bg-bg-elev-1 mt-2 overflow-hidden rounded-sm border">
      <summary
        aria-label="Toggle backup and key migration section"
        className="hover:bg-bg-elev-2 flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors select-none"
      >
        <div className="flex flex-col">
          <span className="text-fg text-sm font-medium">Backup & Key Migration</span>
          <span className="text-caption text-fg-subtle">
            Export your encrypted API keys for backup, or import them on another device.
          </span>
        </div>
        <span className="text-caption text-fg-subtle">▾</span>
      </summary>

      <div className="border-border bg-bg-elev-2/10 grid grid-cols-1 gap-6 border-t p-4 md:grid-cols-2">
        {/* Export Column */}
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
            onClick={handleExport}
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
                  onClick={handleCopy}
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

        {/* Import Column */}
        <div className="border-border flex flex-col gap-4 border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-6">
          <div className="flex items-center gap-2">
            <IconUpload className="text-fg size-4 shrink-0" />
            <h3 className="text-fg-muted text-xs font-bold tracking-wider uppercase">
              Import API Keys
            </h3>
          </div>
          <p className="text-fg-subtle text-xs leading-[1.4]">
            Paste a previously exported backup payload and enter your account password to restore
            your keys.
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="import-payload"
                className="text-fg-subtle text-xs font-bold uppercase"
              >
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
              onClick={handleImport}
              disabled={isImportPending || !importPayload || !importPassword}
              loading={isImportPending}
              className="mt-1 w-full self-start sm:w-auto"
            >
              {isImportPending ? 'Importing…' : 'Decrypt & Restore Keys'}
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}
