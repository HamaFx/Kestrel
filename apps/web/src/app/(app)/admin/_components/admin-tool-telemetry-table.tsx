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
import { IconDownload, IconTool } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import { downloadCSV, formatAbsoluteTime, formatMs, formatRelativeTime } from '@/lib/format-number';
import type { ToolTelemetryRow } from '@/lib/services/admin-dtos';
import { toastApiError } from '@/lib/toast-api-error';

import { AdminErrorBlock } from './admin-error-block';

export function AdminToolTelemetryTable() {
  const [rows, setRows] = useState<ToolTelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<{ entries: ToolTelemetryRow[] }>(
        '/api/admin/diagnostics/tool-telemetry?limit=50',
      );
      setRows(data.entries);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tool telemetry';
      setFetchError(msg);
      toastApiError(err, msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
  }, []);

  function handleExport() {
    downloadCSV(
      rows.map((r) => ({
        tool: r.tool,
        threadId: r.threadId,
        status: r.ok ? 'OK' : 'FAIL',
        ms: r.ms,
        errorCode: r.errorCode ?? '',
        createdAt: r.createdAt,
      })),
      `tool-telemetry-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  if (loading) {
    return <SkeletonCard lines={4} />;
  }

  if (fetchError) {
    return (
      <SettingsSection title="Tool Telemetry" description="Recent AI tool calls.">
        <AdminErrorBlock message={fetchError} onRetry={fetchRows} />
      </SettingsSection>
    );
  }

  const description = 'Recent AI tool calls.';

  return (
    <SettingsSection title="Tool Telemetry" description={description}>
      <div className="flex justify-end gap-2 pb-3">
        <Button variant="secondary" size="sm" onClick={fetchRows}>
          Refresh
        </Button>
        {rows.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <IconDownload className="size-4" aria-hidden="true" />
            CSV
          </Button>
        )}
      </div>
      <div className="border-border overflow-hidden overflow-x-auto rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-bg-elev-2 text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Tool</th>
              <th className="px-4 py-2 text-left font-medium">Thread</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Duration</th>
              <th className="px-4 py-2 text-left font-medium">Error</th>
              <th className="px-4 py-2 text-left font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6">
                  <EmptyState
                    icon={<IconTool className="size-6" />}
                    title="No telemetry found"
                    description="AI tool call telemetry from recent chat sessions will appear here."
                    bare
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-border border-t">
                  <td className="text-fg px-4 py-2 font-mono text-xs">{row.tool}</td>
                  <td className="text-fg-subtle px-4 py-2 font-mono text-xs">{row.threadId}</td>
                  <td className="px-4 py-2">
                    <Badge tone={row.ok ? 'success' : 'danger'}>{row.ok ? 'OK' : 'FAIL'}</Badge>
                  </td>
                  <td className="text-fg-subtle px-4 py-2 tabular-nums">{formatMs(row.ms)}</td>
                  <td className="text-fg-subtle px-4 py-2">{row.errorCode ?? '—'}</td>
                  <td className="text-fg-subtle px-4 py-2">
                    <span title={formatAbsoluteTime(row.createdAt)}>
                      {formatRelativeTime(row.createdAt)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
