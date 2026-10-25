'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Live log-stream shell: composes the SSE hook with the toolbar, the log area
// and the local filter/auto-scroll controls.
import { useState } from 'react';

import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';

import { downloadLog } from './log-format';
import { LogViewerOutput } from './log-viewer-output';
import { LogViewerToolbar } from './log-viewer-toolbar';
import { useLogStream } from './use-log-stream';

export function AdminLogViewer() {
  const { lines, status, notEnabledMsg, isPaused, setIsPaused, clear, connect, disconnect } =
    useLogStream();
  const [filterQuery, setFilterQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  function handleClear() {
    clear();
  }

  function handleDownload() {
    downloadLog(lines);
  }

  return (
    <SettingsSection
      title="Log Stream"
      description={
        status === 'connected'
          ? 'Live log stream. Connected.'
          : status === 'not_enabled'
            ? 'Log streaming is not available.'
            : status === 'production'
              ? 'Not available in production.'
              : 'Real-time server log stream.'
      }
    >
      <div className="flex flex-col gap-3">
        {/* Toolbar */}
        <LogViewerToolbar
          status={status}
          isPaused={isPaused}
          onTogglePause={() => setIsPaused((p) => !p)}
          onClear={handleClear}
          onDownload={handleDownload}
          filterQuery={filterQuery}
          onFilterChange={setFilterQuery}
          autoScroll={autoScroll}
          onAutoScrollChange={setAutoScroll}
          onConnect={() => void connect()}
          onDisconnect={() => disconnect(true)}
        />

        {/* Log area */}
        <LogViewerOutput
          status={status}
          lines={lines}
          notEnabledMsg={notEnabledMsg}
          filterQuery={filterQuery}
          autoScroll={autoScroll}
        />
      </div>
    </SettingsSection>
  );
}
