'use client';

// SPDX-License-Identifier: Apache-2.0

// Log area: disabled/idle placeholders, filtered severity-coloured lines and
// autoscroll on new output.
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/formatters/cn';

import { severityClass, type LogStatus } from './log-format';

interface LogViewerOutputProps {
  status: LogStatus;
  lines: string[];
  notEnabledMsg: string;
  filterQuery: string;
  autoScroll: boolean;
}

export function LogViewerOutput({
  status,
  lines,
  notEnabledMsg,
  filterQuery,
  autoScroll,
}: LogViewerOutputProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Autoscroll when new lines arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end' });
    }
  }, [lines, autoScroll]);

  const filteredLines = filterQuery
    ? lines.filter((l) => l.toLowerCase().includes(filterQuery.toLowerCase()))
    : lines;

  return (
    <div className="border-border bg-bg-elev-1 flex h-[400px] flex-col overflow-hidden rounded-sm border font-mono text-xs">
      {status === 'not_enabled' || status === 'production' ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
          <p className="text-fg-subtle text-sm">
            {notEnabledMsg || 'Log streaming is not enabled.'}
          </p>
        </div>
      ) : status === 'idle' ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-fg-subtle">Click Connect to start streaming.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {filteredLines.length === 0 ? (
            <p className="text-fg-subtle p-2">
              {status === 'connected' ? 'Waiting for log lines…' : 'No lines match the filter.'}
            </p>
          ) : (
            <>
              {filteredLines.map((line, i) => (
                <pre
                  key={`${status}-${i}`}
                  className={cn('py-px break-all whitespace-pre-wrap', severityClass(line))}
                >
                  {line}
                </pre>
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
