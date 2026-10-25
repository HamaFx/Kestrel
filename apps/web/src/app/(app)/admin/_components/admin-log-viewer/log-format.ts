// SPDX-License-Identifier: Apache-2.0

// Log-stream presentation helpers: connection-status badges, severity colours
// and the plain-text log download.
export type LogStatus =
  'idle' | 'connecting' | 'connected' | 'not_enabled' | 'production' | 'error';

export const STATUS_BADGE: Record<LogStatus, { label: string; color: string }> = {
  idle: { label: 'Disconnected', color: 'bg-fg-subtle' },
  connecting: { label: 'Connecting…', color: 'bg-warn animate-pulse' },
  connected: { label: 'Connected', color: 'bg-success' },
  not_enabled: { label: 'Disabled', color: 'bg-fg-subtle' },
  production: { label: 'Production', color: 'bg-fg-subtle' },
  error: { label: 'Disconnected', color: 'bg-danger' },
};

export function severityClass(line: string): string {
  if (/\b(?:ERROR|ERR|FATAL)\b/i.test(line)) return 'text-danger font-semibold';
  if (/\bWARN(?:ING)?\b/i.test(line)) return 'text-warn';
  return 'text-fg';
}

export function downloadLog(lines: string[]) {
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kestrel-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
