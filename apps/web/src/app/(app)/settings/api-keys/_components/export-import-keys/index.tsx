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
import { ExportKeysSection } from './export-keys-section';
import { ImportKeysSection } from './import-keys-section';
import { useExportImportKeys } from './use-export-import-keys';

export function ExportImportKeys() {
  const {
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
  } = useExportImportKeys();

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
        <ExportKeysSection
          exportPassword={exportPassword}
          setExportPassword={setExportPassword}
          showExportPassword={showExportPassword}
          setShowExportPassword={setShowExportPassword}
          exportedPayload={exportedPayload}
          copied={copied}
          isExportPending={isExportPending}
          onExport={handleExport}
          onCopy={handleCopy}
        />

        {/* Import Column */}
        <ImportKeysSection
          importPayload={importPayload}
          setImportPayload={setImportPayload}
          importPassword={importPassword}
          setImportPassword={setImportPassword}
          showImportPassword={showImportPassword}
          setShowImportPassword={setShowImportPassword}
          isImportPending={isImportPending}
          onImport={handleImport}
        />
      </div>
    </details>
  );
}
