// SPDX-License-Identifier: Apache-2.0

// State + handlers for the backup & key migration panel: encrypted export
// generation, clipboard copy, and import/restore.

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { exportKeysAction, importKeysAction } from '@/app/(app)/settings/actions';

export function useExportImportKeys() {
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

  return {
    exportPassword,
    setExportPassword,
    showExportPassword,
    setShowExportPassword,
    exportedPayload,
    copied,
    isExportPending,
    handleExport,
    handleCopy,
    importPayload,
    setImportPayload,
    importPassword,
    setImportPassword,
    showImportPassword,
    setShowImportPassword,
    isImportPending,
    handleImport,
  };
}
