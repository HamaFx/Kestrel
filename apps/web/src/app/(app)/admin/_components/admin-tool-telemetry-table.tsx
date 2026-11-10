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
import { Button, ButtonGroup } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelative } from '@/lib/formatters/datetime';
import { downloadCSV, formatAbsoluteTime, formatMs } from '@/lib/formatters/format-number';
import { apiFetch } from '@/lib/http/api-client';
import { toastApiError } from '@/lib/http/toast-api-error';
import type { ToolTelemetryRow } from '@/lib/services/admin-dtos';

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
      <div className="flex justify-end pb-3">
        <ButtonGroup>
          <Button variant="secondary" size="sm" onClick={fetchRows}>
            Refresh
          </Button>
          {rows.length > 0 && (
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <IconDownload className="size-4" aria-hidden="true" />
              CSV
            </Button>
          )}
        </ButtonGroup>
      </div>
      <div className="overflow-hidden overflow-x-auto rounded-xl border border-white/[0.07]">
        <Table stackOnMobile>
          <TableHeader>
            <tr>
              <TableHead className="px-4">Tool</TableHead>
              <TableHead className="px-4">Thread</TableHead>
              <TableHead className="px-4">Status</TableHead>
              <TableHead numeric className="px-4">
                Duration
              </TableHead>
              <TableHead className="px-4">Error</TableHead>
              <TableHead className="px-4">Time</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="px-4 py-6">
                  <EmptyState
                    icon={<IconTool className="size-6" />}
                    title="No telemetry found"
                    description="AI tool call telemetry from recent chat sessions will appear here."
                    bare
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="row-primary">
                  <TableCell className="text-fg px-4 font-mono text-xs">{row.tool}</TableCell>
                  <TableCell
                    data-label="Thread"
                    className="text-fg-subtle px-4 font-mono text-xs"
                  >
                    {row.threadId}
                  </TableCell>
                  <TableCell data-label="Status" className="px-4">
                    <Badge tone={row.ok ? 'success' : 'danger'} dot>
                      {row.ok ? 'OK' : 'FAIL'}
                    </Badge>
                  </TableCell>
                  <TableCell data-label="Duration" numeric className="text-fg-subtle px-4">
                    {formatMs(row.ms)}
                  </TableCell>
                  <TableCell data-label="Error" className="text-fg-subtle px-4">
                    {row.errorCode ?? '—'}
                  </TableCell>
                  <TableCell data-label="Time" className="text-fg-subtle px-4">
                    <span title={formatAbsoluteTime(row.createdAt)}>
                      {formatRelative(row.createdAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </SettingsSection>
  );
}
